import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  appointments,
  clients,
  integrationConnections,
  integrationSyncLinks,
  locations,
  staff,
  vehicles,
} from "../db/schema.js";
import { BadRequestError } from "./errors.js";
import type { IntegrationConnectionRecord } from "./integrationConnections.js";
import {
  disconnectUserIntegrationConnection,
  getUserIntegrationConnection,
  readConnectionAccessToken,
  readConnectionConfig,
  readConnectionRefreshToken,
  upsertUserIntegrationConnection,
} from "./integrationConnections.js";
import {
  enqueueIntegrationJob,
  markIntegrationJobFailed,
  markIntegrationJobSucceeded,
  type IntegrationJobRecord,
} from "./integrationJobs.js";
import { logger } from "./logger.js";
import { createIntegrationStateToken } from "./jwt.js";
import { createIntegrationAuditLog } from "./integrationAudit.js";
import { isIntegrationFeatureEnabled } from "./integrationFeatureFlags.js";
import { buildVehicleDisplayName } from "./vehicleFormatting.js";

const GOOGLE_CALENDAR_PROVIDER = "google_calendar";
const GOOGLE_CALENDAR_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_CALENDAR_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const CALENDAR_BLOCK_PREFIX = "[[calendar-block:";
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.owned",
] as const;

export type GoogleCalendarIntegrationState = {
  businessId: string;
  userId: string;
  returnPath: string;
};

type GoogleCalendarTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

type GoogleCalendarConnectionConfig = {
  selectedCalendarId?: string | null;
  selectedCalendarSummary?: string | null;
  selectedCalendarTimeZone?: string | null;
};

export type GoogleCalendarListEntry = {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string | null;
  timeZone?: string | null;
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarListEntry[];
};

type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
};

type GoogleCalendarEventPayload = {
  summary: string;
  description?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  location?: string;
  status?: "confirmed";
  extendedProperties: {
    private: {
      strataBusinessId: string;
      strataAppointmentId: string;
      strataConnectionId: string;
    };
  };
};

type AppointmentCalendarProjection = {
  id: string;
  businessId: string;
  title: string | null;
  status: string | null;
  startTime: Date;
  endTime: Date | null;
  expectedCompletionTime: Date | null;
  notes: string | null;
  internalNotes: string | null;
  jobPhase: string | null;
  assignedStaffId: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleTrim: string | null;
  locationName: string | null;
  locationAddress: string | null;
  staffUserId: string | null;
  updatedAt: Date;
  createdAt: Date;
};

function getGoogleClientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!value) throw new BadRequestError("Google Calendar is not configured.");
  return value;
}

function getGoogleClientSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!value) throw new BadRequestError("Google Calendar is not configured.");
  return value;
}

function getGoogleCalendarRedirectUri(): string {
  const apiBase = process.env.API_BASE?.trim();
  if (!apiBase) throw new BadRequestError("API_BASE is required for Google Calendar OAuth.");
  return `${apiBase.replace(/\/+$/, "")}/api/integrations/google-calendar/callback`;
}

export function isGoogleCalendarConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim() &&
    process.env.API_BASE?.trim()
  );
}

export function getGoogleCalendarScopes() {
  return [...GOOGLE_CALENDAR_SCOPES];
}

export function createGoogleCalendarIntegrationStateToken(input: GoogleCalendarIntegrationState) {
  return createIntegrationStateToken(input);
}

export function buildGoogleCalendarAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: getGoogleCalendarRedirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    state,
  });
  return `${GOOGLE_CALENDAR_AUTHORIZE_URL}?${params.toString()}`;
}

export function getGoogleCalendarFrontendReturnPath(status: "connected" | "error" | "disconnected", message?: string) {
  const params = new URLSearchParams({
    tab: "integrations",
    googleCalendar: status,
  });
  if (message) params.set("googleCalendarMessage", message);
  return `/settings?${params.toString()}`;
}

async function exchangeGoogleToken(params: URLSearchParams) {
  const response = await fetch(GOOGLE_CALENDAR_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new BadRequestError(`Google Calendar token exchange failed: ${bodyText || response.statusText}`);
  }
  return JSON.parse(bodyText) as GoogleCalendarTokenResponse;
}

export async function exchangeGoogleCalendarAuthorizationCode(code: string) {
  return exchangeGoogleToken(
    new URLSearchParams({
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: getGoogleCalendarRedirectUri(),
    })
  );
}

async function refreshGoogleCalendarTokens(connection: IntegrationConnectionRecord) {
  const refreshToken = readConnectionRefreshToken(connection);
  if (!refreshToken) throw new BadRequestError("Google Calendar refresh token is missing.");
  const token = await exchangeGoogleToken(
    new URLSearchParams({
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })
  );
  const config = readConnectionConfig<GoogleCalendarConnectionConfig>(connection);
  const updated = await upsertUserIntegrationConnection({
    businessId: connection.businessId,
    userId: connection.userId ?? "",
    provider: GOOGLE_CALENDAR_PROVIDER,
    status: "connected",
    displayName: connection.displayName,
    externalAccountId: connection.externalAccountId,
    externalAccountName: connection.externalAccountName,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? refreshToken,
    tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
    config,
    scopes: JSON.parse(connection.scopes ?? "[]") as string[],
    connectedAt: connection.connectedAt ?? new Date(),
    disconnectedAt: null,
    lastError: null,
    actionRequired: null,
  });
  if (!updated) throw new BadRequestError("Could not refresh the Google Calendar connection.");
  return updated;
}

async function ensureGoogleCalendarAccessToken(connection: IntegrationConnectionRecord) {
  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt) : null;
  if (expiresAt && expiresAt.getTime() > Date.now() + 60_000) {
    const token = readConnectionAccessToken(connection);
    if (token) return { connection, accessToken: token };
  }
  const refreshed = await refreshGoogleCalendarTokens(connection);
  const token = readConnectionAccessToken(refreshed);
  if (!token) throw new BadRequestError("Google Calendar access token is unavailable.");
  return { connection: refreshed, accessToken: token };
}

async function googleCalendarRequest<T>(
  connection: IntegrationConnectionRecord,
  path: string,
  init?: RequestInit
) {
  const { connection: hydratedConnection, accessToken } = await ensureGoogleCalendarAccessToken(connection);
  const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new BadRequestError(`Google Calendar API request failed: ${bodyText || response.statusText}`);
  }
  return {
    connection: hydratedConnection,
    body: bodyText ? (JSON.parse(bodyText) as T) : ({} as T),
  };
}

function pickDefaultCalendar(calendars: GoogleCalendarListEntry[]) {
  return (
    calendars.find((calendar) => calendar.primary) ??
    calendars.find((calendar) => ["owner", "writer"].includes(String(calendar.accessRole ?? "").toLowerCase())) ??
    calendars[0] ??
    null
  );
}

export async function listGoogleCalendarsForConnection(connection: IntegrationConnectionRecord) {
  const response = await googleCalendarRequest<GoogleCalendarListResponse>(
    connection,
    "/users/me/calendarList?minAccessRole=writer&showHidden=false"
  );
  return {
    connection: response.connection,
    calendars: (response.body.items ?? []).map((calendar) => ({
      id: calendar.id,
      summary: calendar.summary ?? calendar.id,
      primary: Boolean(calendar.primary),
      accessRole: calendar.accessRole ?? null,
      timeZone: calendar.timeZone ?? null,
    })),
  };
}

export async function listGoogleCalendarsForUser(businessId: string, userId: string) {
  const connection = await getUserIntegrationConnection(businessId, userId, GOOGLE_CALENDAR_PROVIDER);
  if (!connection || connection.status !== "connected") {
    throw new BadRequestError("Google Calendar is not connected for this user.");
  }
  return listGoogleCalendarsForConnection(connection);
}

export async function connectGoogleCalendarUser(input: {
  businessId: string;
  userId: string;
  code: string;
}) {
  const token = await exchangeGoogleCalendarAuthorizationCode(input.code);
  const provisional = await upsertUserIntegrationConnection({
    businessId: input.businessId,
    userId: input.userId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    status: "connected",
    displayName: "Google Calendar",
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
    config: {},
    scopes: token.scope?.split(" ").filter(Boolean) ?? [...GOOGLE_CALENDAR_SCOPES],
    connectedAt: new Date(),
    disconnectedAt: null,
    lastError: null,
    actionRequired: null,
  });
  if (!provisional) throw new BadRequestError("Could not connect Google Calendar.");

  const { calendars } = await listGoogleCalendarsForConnection(provisional);
  const selected = pickDefaultCalendar(calendars);

  const connected = await upsertUserIntegrationConnection({
    businessId: input.businessId,
    userId: input.userId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    status: "connected",
    displayName: "Google Calendar",
    accessToken: readConnectionAccessToken(provisional),
    refreshToken: readConnectionRefreshToken(provisional),
    tokenExpiresAt: provisional.tokenExpiresAt ? new Date(provisional.tokenExpiresAt) : null,
    config: {
      selectedCalendarId: selected?.id ?? null,
      selectedCalendarSummary: selected?.summary ?? null,
      selectedCalendarTimeZone: selected?.timeZone ?? null,
    },
    scopes: JSON.parse(provisional.scopes ?? "[]") as string[],
    connectedAt: provisional.connectedAt ?? new Date(),
    disconnectedAt: null,
    lastError: null,
    actionRequired: null,
  });
  if (!connected) throw new BadRequestError("Could not finalize Google Calendar setup.");

  await createIntegrationAuditLog({
    businessId: input.businessId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    action: "connected",
    userId: input.userId,
    metadata: {
      connectionId: connected.id,
      selectedCalendarId: selected?.id ?? null,
      selectedCalendarSummary: selected?.summary ?? null,
    },
  });

  return connected;
}

export async function selectGoogleCalendarForUser(input: {
  businessId: string;
  userId: string;
  calendarId: string;
}) {
  const existing = await getUserIntegrationConnection(input.businessId, input.userId, GOOGLE_CALENDAR_PROVIDER);
  if (!existing || existing.status !== "connected") {
    throw new BadRequestError("Google Calendar is not connected for this user.");
  }

  const { connection, calendars } = await listGoogleCalendarsForConnection(existing);
  const selected = calendars.find((calendar) => calendar.id === input.calendarId);
  if (!selected) {
    throw new BadRequestError("Selected Google Calendar was not found or is not writable.");
  }

  const currentConfig = readConnectionConfig<GoogleCalendarConnectionConfig>(connection) ?? {};
  const updated = await upsertUserIntegrationConnection({
    businessId: input.businessId,
    userId: input.userId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    status: "connected",
    displayName: connection.displayName,
    externalAccountId: connection.externalAccountId,
    externalAccountName: connection.externalAccountName,
    accessToken: readConnectionAccessToken(connection),
    refreshToken: readConnectionRefreshToken(connection),
    tokenExpiresAt: connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt) : null,
    config: {
      ...currentConfig,
      selectedCalendarId: selected.id,
      selectedCalendarSummary: selected.summary,
      selectedCalendarTimeZone: selected.timeZone ?? null,
    },
    scopes: JSON.parse(connection.scopes ?? "[]") as string[],
    connectedAt: connection.connectedAt ?? new Date(),
    disconnectedAt: null,
    lastError: null,
    actionRequired: null,
  });
  if (!updated) throw new BadRequestError("Could not save the selected Google Calendar.");

  await createIntegrationAuditLog({
    businessId: input.businessId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    action: "calendar_selected",
    userId: input.userId,
    metadata: {
      connectionId: updated.id,
      selectedCalendarId: selected.id,
      selectedCalendarSummary: selected.summary,
    },
  });

  return updated;
}

export async function disconnectGoogleCalendarUser(businessId: string, userId: string) {
  const disconnected = await disconnectUserIntegrationConnection(businessId, userId, GOOGLE_CALENDAR_PROVIDER);
  if (disconnected) {
    await createIntegrationAuditLog({
      businessId,
      provider: GOOGLE_CALENDAR_PROVIDER,
      action: "disconnected",
      userId,
      metadata: {
        connectionId: disconnected.id,
      },
    });
  }
  return disconnected;
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

async function listAppointmentSyncLinks(businessId: string, appointmentId: string) {
  return db
    .select()
    .from(integrationSyncLinks)
    .where(
      and(
        eq(integrationSyncLinks.businessId, businessId),
        eq(integrationSyncLinks.provider, GOOGLE_CALENDAR_PROVIDER),
        eq(integrationSyncLinks.entityType, "appointment"),
        eq(integrationSyncLinks.entityId, appointmentId)
      )
    );
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
      provider: GOOGLE_CALENDAR_PROVIDER,
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

async function deleteSyncLinkById(id: string) {
  await db.delete(integrationSyncLinks).where(eq(integrationSyncLinks.id, id));
}

async function deleteSyncLink(connectionId: string, entityType: string, entityId: string) {
  const existing = await loadSyncLink(connectionId, entityType, entityId);
  if (existing) {
    await deleteSyncLinkById(existing.id);
  }
}

async function loadAppointmentProjection(businessId: string, appointmentId: string) {
  const [record] = await db
    .select({
      id: appointments.id,
      businessId: appointments.businessId,
      title: appointments.title,
      status: appointments.status,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      expectedCompletionTime: appointments.expectedCompletionTime,
      notes: appointments.notes,
      internalNotes: appointments.internalNotes,
      jobPhase: appointments.jobPhase,
      assignedStaffId: appointments.assignedStaffId,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      vehicleTrim: vehicles.trim,
      locationName: locations.name,
      locationAddress: locations.address,
      staffUserId: staff.userId,
      updatedAt: appointments.updatedAt,
      createdAt: appointments.createdAt,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
    .leftJoin(locations, eq(appointments.locationId, locations.id))
    .leftJoin(staff, eq(appointments.assignedStaffId, staff.id))
    .where(and(eq(appointments.businessId, businessId), eq(appointments.id, appointmentId)))
    .limit(1);
  return (record as AppointmentCalendarProjection | undefined) ?? null;
}

function addDefaultDuration(startTime: Date) {
  return new Date(startTime.getTime() + 60 * 60 * 1000);
}

function buildAppointmentEventPayload(
  appointment: AppointmentCalendarProjection,
  connectionId: string
): GoogleCalendarEventPayload {
  const vehicleLabel = buildVehicleDisplayName({
    year: appointment.vehicleYear,
    make: appointment.vehicleMake,
    model: appointment.vehicleModel,
    trim: appointment.vehicleTrim,
  });
  const clientLabel = [appointment.clientFirstName, appointment.clientLastName].filter(Boolean).join(" ").trim();
  const summary =
    appointment.title?.trim() ||
    [clientLabel || null, vehicleLabel || null].filter(Boolean).join(" • ") ||
    "Service appointment";

  const lines = [
    `Status: ${String(appointment.status ?? "scheduled").replace(/_/g, " ")}`,
    appointment.jobPhase ? `Job phase: ${appointment.jobPhase.replace(/_/g, " ")}` : null,
    clientLabel ? `Client: ${clientLabel}` : null,
    vehicleLabel ? `Vehicle: ${vehicleLabel}` : null,
    appointment.locationName ? `Location: ${appointment.locationName}` : null,
    appointment.locationAddress ? `Address: ${appointment.locationAddress}` : null,
    appointment.notes?.trim() ? `Notes: ${appointment.notes.trim()}` : null,
  ].filter(Boolean);

  const endTime =
    appointment.endTime ??
    appointment.expectedCompletionTime ??
    addDefaultDuration(new Date(appointment.startTime));

  return {
    summary,
    description: lines.join("\n"),
    start: { dateTime: new Date(appointment.startTime).toISOString() },
    end: { dateTime: new Date(endTime).toISOString() },
    location: appointment.locationAddress ?? appointment.locationName ?? undefined,
    status: "confirmed",
    extendedProperties: {
      private: {
        strataBusinessId: appointment.businessId,
        strataAppointmentId: appointment.id,
        strataConnectionId: connectionId,
      },
    },
  };
}

async function deleteGoogleCalendarEvent(
  connection: IntegrationConnectionRecord,
  calendarId: string,
  eventId: string
) {
  const { connection: hydratedConnection } = await googleCalendarRequest<Record<string, never>>(
    connection,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    {
      method: "DELETE",
    }
  );
  return hydratedConnection;
}

export async function syncAppointmentToGoogleCalendar(businessId: string, connectionId: string, appointmentId: string) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.businessId, businessId),
        eq(integrationConnections.provider, GOOGLE_CALENDAR_PROVIDER)
      )
    )
    .limit(1);
  if (!connection || connection.status !== "connected") return { skipped: true };

  const config = readConnectionConfig<GoogleCalendarConnectionConfig>(connection);
  const calendarId = config?.selectedCalendarId?.trim();
  if (!calendarId) throw new BadRequestError("No Google Calendar has been selected for this user.");

  const appointment = await loadAppointmentProjection(businessId, appointmentId);
  if (!appointment) throw new BadRequestError("Appointment not found for Google Calendar sync.");
  if (!appointment.staffUserId || appointment.staffUserId !== connection.userId) return { skipped: true };
  if (String(appointment.status ?? "").toLowerCase() === "cancelled") {
    await removeAppointmentFromGoogleCalendar(businessId, connectionId, appointmentId);
    return { skipped: false, removed: true };
  }
  if (String(appointment.internalNotes ?? "").trim().startsWith(CALENDAR_BLOCK_PREFIX)) {
    await removeAppointmentFromGoogleCalendar(businessId, connectionId, appointmentId);
    return { skipped: false, removed: true };
  }

  let syncLink: typeof integrationSyncLinks.$inferSelect | null = await loadSyncLink(
    connection.id,
    "appointment",
    appointmentId
  );
  const payload = buildAppointmentEventPayload(appointment, connection.id);
  const fingerprint = JSON.stringify(payload);

  if (syncLink?.externalSecondaryId && syncLink.externalSecondaryId !== calendarId) {
    try {
      await deleteGoogleCalendarEvent(connection, syncLink.externalSecondaryId, syncLink.externalId);
    } catch (error) {
      logger.warn("Google Calendar stale event cleanup failed during resync", {
        businessId,
        connectionId,
        appointmentId,
        staleCalendarId: syncLink.externalSecondaryId,
        eventId: syncLink.externalId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await deleteSyncLinkById(syncLink.id);
    syncLink = null;
  }

  if (!syncLink) {
    const created = await googleCalendarRequest<GoogleCalendarEvent>(
      connection,
      `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    const eventId = created.body.id;
    if (!eventId) throw new BadRequestError("Google Calendar did not return an event id.");
    await upsertSyncLink({
      businessId,
      connectionId: connection.id,
      entityType: "appointment",
      entityId: appointmentId,
      externalId: eventId,
      externalSecondaryId: calendarId,
      fingerprint,
    });
    return { skipped: false, externalId: eventId };
  }

  try {
    await googleCalendarRequest<GoogleCalendarEvent>(
      connection,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(syncLink.externalId)}?sendUpdates=none`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("404")) {
      throw error;
    }
    const recreated = await googleCalendarRequest<GoogleCalendarEvent>(
      connection,
      `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    const recreatedId = recreated.body.id;
    if (!recreatedId) throw new BadRequestError("Google Calendar did not return an event id.");
    await upsertSyncLink({
      businessId,
      connectionId: connection.id,
      entityType: "appointment",
      entityId: appointmentId,
      externalId: recreatedId,
      externalSecondaryId: calendarId,
      fingerprint,
    });
    return { skipped: false, externalId: recreatedId, recreated: true };
  }

  await upsertSyncLink({
    businessId,
    connectionId: connection.id,
    entityType: "appointment",
    entityId: appointmentId,
    externalId: syncLink.externalId,
    externalSecondaryId: calendarId,
    fingerprint,
  });
  return { skipped: false, externalId: syncLink.externalId };
}

export async function removeAppointmentFromGoogleCalendar(businessId: string, connectionId: string, appointmentId: string) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.businessId, businessId),
        eq(integrationConnections.provider, GOOGLE_CALENDAR_PROVIDER)
      )
    )
    .limit(1);
  if (!connection) return { skipped: true };

  const syncLink = await loadSyncLink(connection.id, "appointment", appointmentId);
  if (!syncLink) return { skipped: true };

  try {
    await deleteGoogleCalendarEvent(
      connection,
      syncLink.externalSecondaryId ??
        readConnectionConfig<GoogleCalendarConnectionConfig>(connection)?.selectedCalendarId ??
        "primary",
      syncLink.externalId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("404")) {
      throw error;
    }
  }

  await deleteSyncLink(connection.id, "appointment", appointmentId);
  return { skipped: false, removed: true };
}

async function recordGoogleCalendarConnectionSuccess(connectionId: string) {
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

async function recordGoogleCalendarConnectionFailure(connectionId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(integrationConnections)
    .set({
      lastSyncedAt: new Date(),
      lastError: message,
      actionRequired: "Reconnect Google Calendar if the problem continues.",
      status: "error",
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, connectionId));
}

export async function enqueueGoogleCalendarAppointmentSync(input: {
  businessId: string;
  appointmentId: string;
  connectionId: string;
  updatedAt: Date;
  createdByUserId?: string | null;
}) {
  return enqueueIntegrationJob({
    businessId: input.businessId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    connectionId: input.connectionId,
    jobType: "appointment.sync",
    idempotencyKey: `appointment:${input.appointmentId}:sync:${input.connectionId}:${input.updatedAt.toISOString()}`,
    payload: { appointmentId: input.appointmentId },
    createdByUserId: input.createdByUserId ?? null,
  });
}

export async function enqueueGoogleCalendarAppointmentRemoval(input: {
  businessId: string;
  appointmentId: string;
  connectionId: string;
  updatedAt: Date;
  createdByUserId?: string | null;
}) {
  return enqueueIntegrationJob({
    businessId: input.businessId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    connectionId: input.connectionId,
    jobType: "appointment.remove",
    idempotencyKey: `appointment:${input.appointmentId}:remove:${input.connectionId}:${input.updatedAt.toISOString()}`,
    payload: { appointmentId: input.appointmentId },
    createdByUserId: input.createdByUserId ?? null,
  });
}

export async function scheduleGoogleCalendarAppointmentSync(input: {
  businessId: string;
  appointmentId: string;
  createdByUserId?: string | null;
}) {
  if (!isIntegrationFeatureEnabled(GOOGLE_CALENDAR_PROVIDER)) return { queuedSyncJobs: 0, queuedRemovalJobs: 0 };

  const appointment = await loadAppointmentProjection(input.businessId, input.appointmentId);
  if (!appointment) return { queuedSyncJobs: 0, queuedRemovalJobs: 0 };

  const existingLinks = await listAppointmentSyncLinks(input.businessId, input.appointmentId);
  const targetUserId = appointment.staffUserId;
  const targetConnection =
    targetUserId != null
      ? await getUserIntegrationConnection(input.businessId, targetUserId, GOOGLE_CALENDAR_PROVIDER)
      : null;
  const targetConfig = targetConnection ? readConnectionConfig<GoogleCalendarConnectionConfig>(targetConnection) : null;
  const shouldSync =
    !!targetConnection &&
    targetConnection.status === "connected" &&
    targetConnection.featureEnabled &&
    !!targetConfig?.selectedCalendarId &&
    String(appointment.status ?? "").toLowerCase() !== "cancelled" &&
    !String(appointment.internalNotes ?? "").trim().startsWith(CALENDAR_BLOCK_PREFIX);

  let queuedSyncJobs = 0;
  let queuedRemovalJobs = 0;

  for (const link of existingLinks) {
    if (!shouldSync || link.connectionId !== targetConnection?.id) {
      const queued = await enqueueGoogleCalendarAppointmentRemoval({
        businessId: input.businessId,
        appointmentId: input.appointmentId,
        connectionId: link.connectionId,
        updatedAt: appointment.updatedAt ?? appointment.createdAt,
        createdByUserId: input.createdByUserId ?? null,
      });
      if (queued) queuedRemovalJobs += 1;
    }
  }

  if (shouldSync && targetConnection) {
    const queued = await enqueueGoogleCalendarAppointmentSync({
      businessId: input.businessId,
      appointmentId: input.appointmentId,
      connectionId: targetConnection.id,
      updatedAt: appointment.updatedAt ?? appointment.createdAt,
      createdByUserId: input.createdByUserId ?? null,
    });
    if (queued) queuedSyncJobs += 1;
  }

  return { queuedSyncJobs, queuedRemovalJobs };
}

export async function enqueueGoogleCalendarFullResync(input: {
  businessId: string;
  userId: string;
}) {
  if (!isIntegrationFeatureEnabled(GOOGLE_CALENDAR_PROVIDER)) {
    throw new BadRequestError("Google Calendar is not enabled for this environment.");
  }
  const connection = await getUserIntegrationConnection(input.businessId, input.userId, GOOGLE_CALENDAR_PROVIDER);
  if (!connection || connection.status !== "connected") {
    throw new BadRequestError("Google Calendar is not connected for this user.");
  }
  const config = readConnectionConfig<GoogleCalendarConnectionConfig>(connection);
  if (!config?.selectedCalendarId) {
    throw new BadRequestError("Select a Google Calendar before queueing a resync.");
  }

  const staffRows = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.businessId, input.businessId), eq(staff.userId, input.userId)));
  const staffIds = staffRows.map((row) => row.id);
  if (staffIds.length === 0) {
    return { queuedJobs: 0, appointments: 0 };
  }

  const appointmentRows = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.businessId, input.businessId), inArray(appointments.assignedStaffId, staffIds)));

  const queued = await Promise.all(
    appointmentRows.map((row) =>
      enqueueIntegrationJob({
        businessId: input.businessId,
        provider: GOOGLE_CALENDAR_PROVIDER,
        connectionId: connection.id,
        jobType: "appointment.sync",
        idempotencyKey: `manual-resync:appointment:${row.id}:${connection.id}`,
        payload: { appointmentId: row.id },
        createdByUserId: input.userId,
      })
    )
  );

  await createIntegrationAuditLog({
    businessId: input.businessId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    action: "resync_queued",
    userId: input.userId,
    metadata: {
      connectionId: connection.id,
      appointments: appointmentRows.length,
      queuedJobs: queued.filter(Boolean).length,
    },
  });

  return {
    queuedJobs: queued.filter(Boolean).length,
    appointments: appointmentRows.length,
  };
}

export async function runGoogleCalendarIntegrationJob(job: IntegrationJobRecord) {
  const payload = JSON.parse(job.payload ?? "{}") as { appointmentId?: string };
  try {
    let result: Record<string, unknown>;
    if (job.jobType === "appointment.sync") {
      if (!payload.appointmentId || !job.connectionId) {
        throw new BadRequestError("Google Calendar appointment sync job is missing appointmentId or connectionId.");
      }
      result = await syncAppointmentToGoogleCalendar(job.businessId, job.connectionId, payload.appointmentId);
    } else if (job.jobType === "appointment.remove") {
      if (!payload.appointmentId || !job.connectionId) {
        throw new BadRequestError("Google Calendar appointment removal job is missing appointmentId or connectionId.");
      }
      result = await removeAppointmentFromGoogleCalendar(job.businessId, job.connectionId, payload.appointmentId);
    } else {
      throw new BadRequestError(`Unsupported Google Calendar job type: ${job.jobType}`);
    }

    await markIntegrationJobSucceeded(job.id, payload, result);
    if (job.connectionId) {
      await recordGoogleCalendarConnectionSuccess(job.connectionId);
    }
    return { ok: true, result };
  } catch (error) {
    if (job.connectionId) {
      await recordGoogleCalendarConnectionFailure(job.connectionId, error);
    }
    await markIntegrationJobFailed(job, error, payload);
    throw error;
  }
}
