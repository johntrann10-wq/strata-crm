import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  clients,
  integrationConnections,
  invoiceLineItems,
  integrationSyncLinks,
  invoices,
  payments,
} from "../db/schema.js";
import { BadRequestError } from "./errors.js";
import type { IntegrationConnectionRecord } from "./integrationConnections.js";
import {
  disconnectBusinessIntegrationConnection,
  getBusinessIntegrationConnection,
  readConnectionAccessToken,
  readConnectionConfig,
  readConnectionRefreshToken,
  upsertBusinessIntegrationConnection,
} from "./integrationConnections.js";
import { enqueueIntegrationJob, markIntegrationJobFailed, markIntegrationJobSucceeded, type IntegrationJobRecord } from "./integrationJobs.js";
import { logger } from "./logger.js";
import { createIntegrationStateToken } from "./jwt.js";
import { createIntegrationAuditLog } from "./integrationAudit.js";
import { isIntegrationFeatureEnabled } from "./integrationFeatureFlags.js";

const QUICKBOOKS_SCOPE = "com.intuit.quickbooks.accounting";
const QUICKBOOKS_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QUICKBOOKS_API_BASE = "https://quickbooks.api.intuit.com/v3/company";
const QUICKBOOKS_MINOR_VERSION = "75";
const QUICKBOOKS_PROVIDER = "quickbooks_online";

export type QuickBooksIntegrationState = {
  businessId: string;
  userId: string;
  returnPath: string;
};

type QuickBooksTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type: string;
};

type QuickBooksConnectionConfig = {
  realmId: string;
  defaultItemId?: string | null;
  defaultIncomeAccountId?: string | null;
};

type QuickBooksEntityResponse<T> = {
  QueryResponse?: Record<string, T[] | undefined>;
  Customer?: T;
  Invoice?: T;
  Payment?: T;
  Item?: T;
  Fault?: { Error?: Array<{ Message?: string; Detail?: string }> };
};

function getQuickBooksClientId(): string {
  const value = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  if (!value) throw new BadRequestError("QuickBooks is not configured.");
  return value;
}

function getQuickBooksClientSecret(): string {
  const value = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  if (!value) throw new BadRequestError("QuickBooks is not configured.");
  return value;
}

function getQuickBooksRedirectUri(): string {
  const apiBase = process.env.API_BASE?.trim();
  if (!apiBase) throw new BadRequestError("API_BASE is required for QuickBooks OAuth.");
  return `${apiBase.replace(/\/+$/, "")}/api/integrations/quickbooks/callback`;
}

export function isQuickBooksConfigured() {
  return !!(
    process.env.QUICKBOOKS_CLIENT_ID?.trim() &&
    process.env.QUICKBOOKS_CLIENT_SECRET?.trim() &&
    process.env.API_BASE?.trim()
  );
}

export function getQuickBooksScope() {
  return QUICKBOOKS_SCOPE;
}

export function createQuickBooksIntegrationStateToken(input: QuickBooksIntegrationState) {
  return createIntegrationStateToken(input);
}

export function buildQuickBooksAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: getQuickBooksClientId(),
    response_type: "code",
    scope: QUICKBOOKS_SCOPE,
    redirect_uri: getQuickBooksRedirectUri(),
    state,
  });
  return `${QUICKBOOKS_AUTHORIZE_URL}?${params.toString()}`;
}

export function getQuickBooksFrontendReturnPath(status: "connected" | "error" | "disconnected", message?: string) {
  const params = new URLSearchParams({
    tab: "integrations",
    quickbooks: status,
  });
  if (message) params.set("quickbooksMessage", message);
  return `/settings?${params.toString()}`;
}

async function exchangeQuickBooksToken(params: URLSearchParams) {
  const credentials = Buffer.from(`${getQuickBooksClientId()}:${getQuickBooksClientSecret()}`).toString("base64");
  const response = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new BadRequestError(`QuickBooks token exchange failed: ${bodyText || response.statusText}`);
  }
  return JSON.parse(bodyText) as QuickBooksTokenResponse;
}

export async function exchangeQuickBooksAuthorizationCode(code: string) {
  return exchangeQuickBooksToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getQuickBooksRedirectUri(),
    })
  );
}

export async function connectQuickBooksBusiness(input: {
  businessId: string;
  userId: string;
  code: string;
  realmId: string;
}) {
  const token = await exchangeQuickBooksAuthorizationCode(input.code);
  const connection = await upsertBusinessIntegrationConnection({
    businessId: input.businessId,
    provider: QUICKBOOKS_PROVIDER,
    status: "connected",
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
    config: {
      realmId: input.realmId,
    },
    externalAccountId: input.realmId,
    externalAccountName: `QuickBooks company ${input.realmId}`,
    scopes: [QUICKBOOKS_SCOPE],
    connectedAt: new Date(),
    disconnectedAt: null,
    lastError: null,
    actionRequired: null,
  });
  if (!connection) throw new BadRequestError("Could not connect QuickBooks.");
  await createIntegrationAuditLog({
    businessId: input.businessId,
    provider: QUICKBOOKS_PROVIDER,
    action: "connected",
    userId: input.userId,
    metadata: {
      realmId: input.realmId,
      connectionId: connection.id,
    },
  });
  return connection;
}

async function refreshQuickBooksTokens(connection: IntegrationConnectionRecord) {
  const refreshToken = readConnectionRefreshToken(connection);
  if (!refreshToken) throw new BadRequestError("QuickBooks refresh token is missing.");
  const token = await exchangeQuickBooksToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );
  const config = readConnectionConfig<QuickBooksConnectionConfig>(connection);
  const updated = await upsertBusinessIntegrationConnection({
    businessId: connection.businessId,
    provider: QUICKBOOKS_PROVIDER,
    status: "connected",
    displayName: connection.displayName,
    externalAccountId: connection.externalAccountId,
    externalAccountName: connection.externalAccountName,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
    config,
    scopes: JSON.parse(connection.scopes ?? "[]") as string[],
    connectedAt: connection.connectedAt ?? new Date(),
    disconnectedAt: null,
  });
  if (!updated) throw new BadRequestError("Could not refresh QuickBooks connection.");
  return updated;
}

async function ensureQuickBooksAccessToken(connection: IntegrationConnectionRecord) {
  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt) : null;
  if (expiresAt && expiresAt.getTime() > Date.now() + 60_000) {
    const token = readConnectionAccessToken(connection);
    if (token) return { connection, accessToken: token };
  }
  const refreshed = await refreshQuickBooksTokens(connection);
  const token = readConnectionAccessToken(refreshed);
  if (!token) throw new BadRequestError("QuickBooks access token is unavailable.");
  return { connection: refreshed, accessToken: token };
}

async function quickBooksRequest<T>(
  connection: IntegrationConnectionRecord,
  path: string,
  init?: RequestInit
) {
  const config = readConnectionConfig<QuickBooksConnectionConfig>(connection);
  if (!config?.realmId) throw new BadRequestError("QuickBooks realm is missing.");

  const { connection: hydratedConnection, accessToken } = await ensureQuickBooksAccessToken(connection);
  const url = `${QUICKBOOKS_API_BASE}/${encodeURIComponent(config.realmId)}${path}${
    path.includes("?") ? "&" : "?"
  }minorversion=${QUICKBOOKS_MINOR_VERSION}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const bodyText = await response.text();
  if (!response.ok) {
    logger.warn("QuickBooks API request failed", {
      businessId: connection.businessId,
      status: response.status,
      path,
      detail: bodyText.slice(0, 300),
    });
    throw new BadRequestError(`QuickBooks API request failed: ${bodyText || response.statusText}`);
  }
  return {
    connection: hydratedConnection,
    body: bodyText ? (JSON.parse(bodyText) as T) : ({} as T),
  };
}

async function loadSyncLink(connectionId: string, entityType: string, entityId: string) {
  const [link] = await db
    .select()
    .from(integrationSyncLinks)
    .where(
      and(
        eq(integrationSyncLinks.connectionId, connectionId),
        eq(integrationSyncLinks.entityType, entityType),
        eq(integrationSyncLinks.entityId, entityId)
      )
    )
    .limit(1);
  return link ?? null;
}

async function upsertSyncLink(input: {
  businessId: string;
  connectionId: string;
  entityType: string;
  entityId: string;
  externalId: string;
  externalSecondaryId?: string | null;
  fingerprint?: string | null;
}) {
  const existing = await loadSyncLink(input.connectionId, input.entityType, input.entityId);
  if (existing) {
    const [updated] = await db
      .update(integrationSyncLinks)
      .set({
        externalId: input.externalId,
        externalSecondaryId: input.externalSecondaryId ?? null,
        fingerprint: input.fingerprint ?? null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(integrationSyncLinks.id, existing.id))
      .returning();
    return updated ?? null;
  }

  const [created] = await db
    .insert(integrationSyncLinks)
    .values({
      businessId: input.businessId,
      connectionId: input.connectionId,
      provider: "quickbooks_online",
      entityType: input.entityType,
      entityId: input.entityId,
      externalId: input.externalId,
      externalSecondaryId: input.externalSecondaryId ?? null,
      fingerprint: input.fingerprint ?? null,
      lastSyncedAt: new Date(),
    })
    .returning();
  return created ?? null;
}

async function ensureQuickBooksServiceItem(connection: IntegrationConnectionRecord) {
  const config = readConnectionConfig<QuickBooksConnectionConfig>(connection) ?? { realmId: "" };
  if (config.defaultItemId) {
    return { connection, itemId: config.defaultItemId };
  }

  const { accountId } = await ensureQuickBooksIncomeAccount(connection);

  const query = encodeURIComponent("select * from Item where Name = 'Strata Service'");
  const queried = await quickBooksRequest<QuickBooksEntityResponse<{ Id: string }>>(
    connection,
    `/query?query=${query}`
  );
  const existingItem = queried.body.QueryResponse?.Item?.[0];
  if (existingItem?.Id) {
    await upsertBusinessIntegrationConnection({
      businessId: connection.businessId,
      provider: "quickbooks_online",
      status: connection.status,
      displayName: connection.displayName,
      externalAccountId: connection.externalAccountId,
      externalAccountName: connection.externalAccountName,
      accessToken: readConnectionAccessToken(queried.connection),
      refreshToken: readConnectionRefreshToken(queried.connection),
      tokenExpiresAt: queried.connection.tokenExpiresAt ? new Date(queried.connection.tokenExpiresAt) : null,
      config: { ...config, defaultItemId: existingItem.Id },
      scopes: JSON.parse(queried.connection.scopes ?? "[]") as string[],
      connectedAt: queried.connection.connectedAt ?? new Date(),
      disconnectedAt: queried.connection.disconnectedAt ?? null,
    });
    return { connection: queried.connection, itemId: existingItem.Id };
  }

  const created = await quickBooksRequest<QuickBooksEntityResponse<{ Id: string }>>(connection, "/item", {
    method: "POST",
    body: JSON.stringify({
      Name: "Strata Service",
      Type: "Service",
      IncomeAccountRef: { value: accountId },
    }),
  });
  const itemId = created.body.Item?.Id;
  if (!itemId) throw new BadRequestError("QuickBooks did not return the default service item.");
  await upsertBusinessIntegrationConnection({
    businessId: connection.businessId,
    provider: "quickbooks_online",
    status: connection.status,
    displayName: connection.displayName,
    externalAccountId: connection.externalAccountId,
    externalAccountName: connection.externalAccountName,
    accessToken: readConnectionAccessToken(created.connection),
    refreshToken: readConnectionRefreshToken(created.connection),
    tokenExpiresAt: created.connection.tokenExpiresAt ? new Date(created.connection.tokenExpiresAt) : null,
    config: { ...config, defaultItemId: itemId },
    scopes: JSON.parse(created.connection.scopes ?? "[]") as string[],
    connectedAt: created.connection.connectedAt ?? new Date(),
    disconnectedAt: created.connection.disconnectedAt ?? null,
  });
  return { connection: created.connection, itemId };
}

export async function syncClientToQuickBooks(businessId: string, clientId: string) {
  const connection = await getBusinessIntegrationConnection(businessId, QUICKBOOKS_PROVIDER);
  if (!connection || connection.status !== "connected") return { skipped: true };

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.businessId, businessId), eq(clients.id, clientId)))
    .limit(1);
  if (!client) throw new BadRequestError("Client not found for QuickBooks sync.");

  const syncLink = await loadSyncLink(connection.id, "client", clientId);
  const payload = {
    DisplayName: `${client.firstName} ${client.lastName}`.trim(),
    GivenName: client.firstName,
    FamilyName: client.lastName,
    PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
    PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
    BillAddr:
      client.address || client.city || client.state || client.zip
        ? {
            Line1: client.address ?? undefined,
            City: client.city ?? undefined,
            CountrySubDivisionCode: client.state ?? undefined,
            PostalCode: client.zip ?? undefined,
          }
        : undefined,
  };

  if (!syncLink) {
    const created = await quickBooksRequest<QuickBooksEntityResponse<{ Id: string }>>(connection, "/customer", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const externalId = created.body.Customer?.Id;
    if (!externalId) throw new BadRequestError("QuickBooks did not return a customer id.");
    await upsertSyncLink({
      businessId,
      connectionId: connection.id,
      entityType: "client",
      entityId: clientId,
      externalId,
      fingerprint: JSON.stringify(payload),
    });
    return { skipped: false, externalId };
  }

  const existing = await quickBooksRequest<QuickBooksEntityResponse<{ Id: string; SyncToken: string }>>(
    connection,
    `/customer/${encodeURIComponent(syncLink.externalId)}`
  );
  const remote = existing.body.Customer;
  if (!remote?.Id || !remote.SyncToken) {
    throw new BadRequestError("QuickBooks customer SyncToken is missing.");
  }
  await quickBooksRequest(connection, "/customer", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      Id: remote.Id,
      SyncToken: remote.SyncToken,
      sparse: true,
    }),
  });
  await upsertSyncLink({
    businessId,
    connectionId: connection.id,
    entityType: "client",
    entityId: clientId,
    externalId: remote.Id,
    fingerprint: JSON.stringify(payload),
  });
  return { skipped: false, externalId: remote.Id };
}

export async function syncInvoiceToQuickBooks(businessId: string, invoiceId: string) {
  const connection = await getBusinessIntegrationConnection(businessId, QUICKBOOKS_PROVIDER);
  if (!connection || connection.status !== "connected") return { skipped: true };

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.businessId, businessId), eq(invoices.id, invoiceId)))
    .limit(1);
  if (!invoice) throw new BadRequestError("Invoice not found for QuickBooks sync.");

  const customer = await syncClientToQuickBooks(businessId, invoice.clientId);
  const customerLink = await loadSyncLink(connection.id, "client", invoice.clientId);
  if (!customerLink?.externalId) throw new BadRequestError("QuickBooks customer link is missing for invoice sync.");

  const { itemId } = await ensureQuickBooksServiceItem(connection);
  const lines = await db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId));

  const linePayload = lines.map((line) => ({
    Amount: Number(line.total ?? 0),
    DetailType: "SalesItemLineDetail",
    Description: line.description,
    SalesItemLineDetail: {
      ItemRef: { value: itemId },
      Qty: Number(line.quantity ?? 1),
      UnitPrice: Number(line.unitPrice ?? 0),
    },
  }));

  const payload = {
    DocNumber: invoice.invoiceNumber ?? undefined,
    CustomerRef: { value: customerLink.externalId },
    TxnDate: invoice.createdAt ? new Date(invoice.createdAt).toISOString().slice(0, 10) : undefined,
    DueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : undefined,
    PrivateNote: invoice.notes ?? undefined,
    Line: linePayload,
  };

  const syncLink = await loadSyncLink(connection.id, "invoice", invoiceId);
  if (!syncLink) {
    const created = await quickBooksRequest<QuickBooksEntityResponse<{ Id: string }>>(connection, "/invoice", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const externalId = created.body.Invoice?.Id;
    if (!externalId) throw new BadRequestError("QuickBooks did not return an invoice id.");
    await upsertSyncLink({
      businessId,
      connectionId: connection.id,
      entityType: "invoice",
      entityId: invoiceId,
      externalId,
      fingerprint: JSON.stringify(payload),
    });
    return { skipped: false, externalId };
  }

  const existing = await quickBooksRequest<QuickBooksEntityResponse<{ Id: string; SyncToken: string }>>(
    connection,
    `/invoice/${encodeURIComponent(syncLink.externalId)}`
  );
  const remote = existing.body.Invoice;
  if (!remote?.Id || !remote.SyncToken) {
    throw new BadRequestError("QuickBooks invoice SyncToken is missing.");
  }
  await quickBooksRequest(connection, "/invoice", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      Id: remote.Id,
      SyncToken: remote.SyncToken,
      sparse: true,
    }),
  });
  await upsertSyncLink({
    businessId,
    connectionId: connection.id,
    entityType: "invoice",
    entityId: invoiceId,
    externalId: remote.Id,
    fingerprint: JSON.stringify(payload),
  });
  return { skipped: false, externalId: remote.Id };
}

export async function syncPaymentToQuickBooks(businessId: string, paymentId: string) {
  const connection = await getBusinessIntegrationConnection(businessId, QUICKBOOKS_PROVIDER);
  if (!connection || connection.status !== "connected") return { skipped: true };

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.businessId, businessId), eq(payments.id, paymentId)))
    .limit(1);
  if (!payment) throw new BadRequestError("Payment not found for QuickBooks sync.");
  if (payment.reversedAt) return { skipped: true };

  await syncInvoiceToQuickBooks(businessId, payment.invoiceId);
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.businessId, businessId), eq(invoices.id, payment.invoiceId)))
    .limit(1);
  if (!invoice) throw new BadRequestError("Invoice not found for QuickBooks payment sync.");

  const customerLink = await loadSyncLink(connection.id, "client", invoice.clientId);
  const invoiceLink = await loadSyncLink(connection.id, "invoice", payment.invoiceId);
  if (!customerLink?.externalId || !invoiceLink?.externalId) {
    throw new BadRequestError("QuickBooks links are missing for payment sync.");
  }

  const payload = {
    TotalAmt: Number(payment.amount ?? 0),
    CustomerRef: { value: customerLink.externalId },
    TxnDate: payment.paidAt ? new Date(payment.paidAt).toISOString().slice(0, 10) : undefined,
    PrivateNote: payment.notes ?? undefined,
    Line: [
      {
        Amount: Number(payment.amount ?? 0),
        LinkedTxn: [{ TxnId: invoiceLink.externalId, TxnType: "Invoice" }],
      },
    ],
  };

  const syncLink = await loadSyncLink(connection.id, "payment", paymentId);
  if (!syncLink) {
    const created = await quickBooksRequest<QuickBooksEntityResponse<{ Id: string }>>(connection, "/payment", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const externalId = created.body.Payment?.Id;
    if (!externalId) throw new BadRequestError("QuickBooks did not return a payment id.");
    await upsertSyncLink({
      businessId,
      connectionId: connection.id,
      entityType: "payment",
      entityId: paymentId,
      externalId,
      fingerprint: JSON.stringify(payload),
    });
    return { skipped: false, externalId };
  }

  return { skipped: false, externalId: syncLink.externalId };
}

async function ensureQuickBooksIncomeAccount(connection: IntegrationConnectionRecord) {
  const config = readConnectionConfig<QuickBooksConnectionConfig>(connection) ?? { realmId: "" };
  if (config.defaultIncomeAccountId) {
    return { connection, accountId: config.defaultIncomeAccountId };
  }

  const query = encodeURIComponent("select * from Account where AccountType = 'Income' maxresults 1");
  const queried = await quickBooksRequest<QuickBooksEntityResponse<{ Id: string }>>(
    connection,
    `/query?query=${query}`
  );
  const existingAccount = queried.body.QueryResponse?.Account?.[0];
  if (!existingAccount?.Id) {
    throw new BadRequestError("QuickBooks does not have an income account available for Strata service items.");
  }

  await upsertBusinessIntegrationConnection({
    businessId: connection.businessId,
    provider: QUICKBOOKS_PROVIDER,
    status: queried.connection.status,
    displayName: queried.connection.displayName,
    externalAccountId: queried.connection.externalAccountId,
    externalAccountName: queried.connection.externalAccountName,
    accessToken: readConnectionAccessToken(queried.connection),
    refreshToken: readConnectionRefreshToken(queried.connection),
    tokenExpiresAt: queried.connection.tokenExpiresAt ? new Date(queried.connection.tokenExpiresAt) : null,
    config: { ...config, defaultIncomeAccountId: existingAccount.Id },
    scopes: JSON.parse(queried.connection.scopes ?? "[]") as string[],
    connectedAt: queried.connection.connectedAt ?? new Date(),
    disconnectedAt: queried.connection.disconnectedAt ?? null,
  });

  return { connection: queried.connection, accountId: existingAccount.Id };
}

async function recordQuickBooksConnectionSuccess(connectionId: string) {
  await db
    .update(integrationConnections)
    .set({
      lastSyncedAt: new Date(),
      lastSuccessfulAt: new Date(),
      lastError: null,
      actionRequired: null,
      status: "connected",
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, connectionId));
}

async function recordQuickBooksConnectionFailure(connectionId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(integrationConnections)
    .set({
      lastSyncedAt: new Date(),
      lastError: message,
      status: "error",
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, connectionId));
}

export async function disconnectQuickBooksBusiness(businessId: string, userId: string) {
  const disconnected = await disconnectBusinessIntegrationConnection(businessId, QUICKBOOKS_PROVIDER);
  if (disconnected) {
    await createIntegrationAuditLog({
      businessId,
      provider: QUICKBOOKS_PROVIDER,
      action: "disconnected",
      userId,
      metadata: {
        connectionId: disconnected.id,
      },
    });
  }
  return disconnected;
}

export async function enqueueQuickBooksCustomerSync(input: {
  businessId: string;
  clientId: string;
  userId?: string | null;
}) {
  if (!isIntegrationFeatureEnabled(QUICKBOOKS_PROVIDER)) return null;
  const connection = await getBusinessIntegrationConnection(input.businessId, QUICKBOOKS_PROVIDER);
  if (!connection || connection.status !== "connected" || !connection.featureEnabled) return null;
  const [client] = await db
    .select({ id: clients.id, updatedAt: clients.updatedAt, createdAt: clients.createdAt })
    .from(clients)
    .where(and(eq(clients.businessId, input.businessId), eq(clients.id, input.clientId)))
    .limit(1);
  if (!client) return null;
  return enqueueIntegrationJob({
    businessId: input.businessId,
    provider: QUICKBOOKS_PROVIDER,
    connectionId: connection.id,
    jobType: "customer.sync",
    idempotencyKey: `client:${client.id}:${(client.updatedAt ?? client.createdAt).toISOString()}`,
    payload: { clientId: client.id },
    createdByUserId: input.userId ?? null,
  });
}

export async function enqueueQuickBooksInvoiceSync(input: {
  businessId: string;
  invoiceId: string;
  userId?: string | null;
}) {
  if (!isIntegrationFeatureEnabled(QUICKBOOKS_PROVIDER)) return null;
  const connection = await getBusinessIntegrationConnection(input.businessId, QUICKBOOKS_PROVIDER);
  if (!connection || connection.status !== "connected" || !connection.featureEnabled) return null;
  const [invoice] = await db
    .select({ id: invoices.id, updatedAt: invoices.updatedAt, createdAt: invoices.createdAt })
    .from(invoices)
    .where(and(eq(invoices.businessId, input.businessId), eq(invoices.id, input.invoiceId)))
    .limit(1);
  if (!invoice) return null;
  return enqueueIntegrationJob({
    businessId: input.businessId,
    provider: QUICKBOOKS_PROVIDER,
    connectionId: connection.id,
    jobType: "invoice.sync",
    idempotencyKey: `invoice:${invoice.id}:${(invoice.updatedAt ?? invoice.createdAt).toISOString()}`,
    payload: { invoiceId: invoice.id },
    createdByUserId: input.userId ?? null,
  });
}

export async function enqueueQuickBooksPaymentSync(input: {
  businessId: string;
  paymentId: string;
  userId?: string | null;
}) {
  if (!isIntegrationFeatureEnabled(QUICKBOOKS_PROVIDER)) return null;
  const connection = await getBusinessIntegrationConnection(input.businessId, QUICKBOOKS_PROVIDER);
  if (!connection || connection.status !== "connected" || !connection.featureEnabled) return null;
  const [payment] = await db
    .select({ id: payments.id, updatedAt: payments.updatedAt, createdAt: payments.createdAt })
    .from(payments)
    .where(and(eq(payments.businessId, input.businessId), eq(payments.id, input.paymentId), isNull(payments.reversedAt)))
    .limit(1);
  if (!payment) return null;
  return enqueueIntegrationJob({
    businessId: input.businessId,
    provider: QUICKBOOKS_PROVIDER,
    connectionId: connection.id,
    jobType: "payment.sync",
    idempotencyKey: `payment:${payment.id}:${(payment.updatedAt ?? payment.createdAt).toISOString()}`,
    payload: { paymentId: payment.id },
    createdByUserId: input.userId ?? null,
  });
}

export async function enqueueQuickBooksFullResync(input: {
  businessId: string;
  userId: string;
}) {
  if (!isIntegrationFeatureEnabled(QUICKBOOKS_PROVIDER)) {
    throw new BadRequestError("QuickBooks Online is not enabled for this environment.");
  }
  const connection = await getBusinessIntegrationConnection(input.businessId, QUICKBOOKS_PROVIDER);
  if (!connection || connection.status !== "connected") {
    throw new BadRequestError("QuickBooks is not connected for this business.");
  }

  const [clientRows, invoiceRows, paymentRows] = await Promise.all([
    db.select({ id: clients.id }).from(clients).where(eq(clients.businessId, input.businessId)),
    db.select({ id: invoices.id }).from(invoices).where(eq(invoices.businessId, input.businessId)),
    db.select({ id: payments.id }).from(payments).where(and(eq(payments.businessId, input.businessId), isNull(payments.reversedAt))),
  ]);

  const queued = await Promise.all([
    ...clientRows.map((row) =>
      enqueueIntegrationJob({
        businessId: input.businessId,
        provider: QUICKBOOKS_PROVIDER,
        connectionId: connection.id,
        jobType: "customer.sync",
        idempotencyKey: `manual-resync:client:${row.id}`,
        payload: { clientId: row.id },
        createdByUserId: input.userId,
      })
    ),
    ...invoiceRows.map((row) =>
      enqueueIntegrationJob({
        businessId: input.businessId,
        provider: QUICKBOOKS_PROVIDER,
        connectionId: connection.id,
        jobType: "invoice.sync",
        idempotencyKey: `manual-resync:invoice:${row.id}`,
        payload: { invoiceId: row.id },
        createdByUserId: input.userId,
      })
    ),
    ...paymentRows.map((row) =>
      enqueueIntegrationJob({
        businessId: input.businessId,
        provider: QUICKBOOKS_PROVIDER,
        connectionId: connection.id,
        jobType: "payment.sync",
        idempotencyKey: `manual-resync:payment:${row.id}`,
        payload: { paymentId: row.id },
        createdByUserId: input.userId,
      })
    ),
  ]);

  await createIntegrationAuditLog({
    businessId: input.businessId,
    provider: QUICKBOOKS_PROVIDER,
    action: "resync_queued",
    userId: input.userId,
    metadata: {
      queuedJobs: queued.filter(Boolean).length,
      clients: clientRows.length,
      invoices: invoiceRows.length,
      payments: paymentRows.length,
    },
  });

  return {
    queuedJobs: queued.filter(Boolean).length,
    clients: clientRows.length,
    invoices: invoiceRows.length,
    payments: paymentRows.length,
  };
}

export async function runQuickBooksIntegrationJob(job: IntegrationJobRecord) {
  const payload = JSON.parse(job.payload ?? "{}") as { clientId?: string; invoiceId?: string; paymentId?: string };
  try {
    let result: Record<string, unknown>;
    if (job.jobType === "customer.sync") {
      if (!payload.clientId) throw new BadRequestError("QuickBooks customer sync payload is missing clientId.");
      result = await syncClientToQuickBooks(job.businessId, payload.clientId);
    } else if (job.jobType === "invoice.sync") {
      if (!payload.invoiceId) throw new BadRequestError("QuickBooks invoice sync payload is missing invoiceId.");
      result = await syncInvoiceToQuickBooks(job.businessId, payload.invoiceId);
    } else if (job.jobType === "payment.sync") {
      if (!payload.paymentId) throw new BadRequestError("QuickBooks payment sync payload is missing paymentId.");
      result = await syncPaymentToQuickBooks(job.businessId, payload.paymentId);
    } else {
      throw new BadRequestError(`Unsupported QuickBooks job type: ${job.jobType}`);
    }

    await markIntegrationJobSucceeded(job.id, payload, result);
    if (job.connectionId) {
      await recordQuickBooksConnectionSuccess(job.connectionId);
    }
    return { ok: true, result };
  } catch (error) {
    if (job.connectionId) {
      await recordQuickBooksConnectionFailure(job.connectionId, error);
    }
    await markIntegrationJobFailed(job, error, payload);
    throw error;
  }
}
