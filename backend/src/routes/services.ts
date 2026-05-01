import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { appointmentServices, serviceCategories, services } from "../db/schema.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { warnOnce } from "../lib/warnOnce.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireTenant } from "../middleware/tenant.js";
import {
  ensureBusinessServiceCategories,
  formatLegacyServiceCategory,
  isLegacyServiceCategory,
  LEGACY_SERVICE_CATEGORIES,
  type LegacyServiceCategory,
} from "../lib/serviceCategories.js";
import {
  normalizeBookingDailyHours,
  normalizeBookingServiceMode,
  parseBookingDailyHours,
  parseTimeToMinutes,
  type BookingDailyHoursEntry,
} from "../lib/booking.js";
import {
  normalizeBookingRequestAlternateOfferExpiryHours,
  normalizeBookingRequestAlternateSlotLimit,
} from "../lib/bookingRequestSettings.js";

export const servicesRouter = Router({ mergeParams: true });

const LEGACY_CATEGORY_PREFIX = "[[strata:service-category=";

type ServiceRow = {
  id: string;
  businessId: string;
  name: string;
  notes: string | null;
  price: string | null;
  durationMinutes: number | null;
  category: string | null;
  categoryId: string | null;
  categoryLabel: string | null;
  categorySortOrder: number | null;
  sortOrder: number | null;
  taxable: boolean | null;
  isAddon: boolean | null;
  bookingEnabled: boolean | null;
  bookingFlowType: string | null;
  bookingDescription: string | null;
  bookingDepositAmount: string | null;
  bookingLeadTimeHours: number | null;
  bookingWindowDays: number | null;
  bookingRequestRequireExactTime: boolean | null;
  bookingRequestAllowTimeWindows: boolean | null;
  bookingRequestAllowFlexibility: boolean | null;
  bookingRequestReviewMessage: string | null;
  bookingRequestAllowAlternateSlots: boolean | null;
  bookingRequestAlternateSlotLimit: number | null;
  bookingRequestAlternateOfferExpiryHours: number | null;
  bookingServiceMode: string | null;
  bookingAvailableDays: number[] | null;
  bookingAvailableStartTime: string | null;
  bookingAvailableEndTime: string | null;
  bookingDailyHours: BookingDailyHoursEntry[] | null;
  bookingBufferMinutes: number | null;
  bookingCapacityPerSlot: number | null;
  bookingFeatured: boolean | null;
  bookingHidePrice: boolean | null;
  bookingHideDuration: boolean | null;
  active: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function parseFilter(req: Request): Record<string, unknown> | undefined {
  try {
    return req.query.filter ? (JSON.parse(String(req.query.filter)) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function isServiceSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

function encodeLegacyServiceNotes(notes: string | null | undefined, category: string | null | undefined): string | null {
  const trimmedNotes = typeof notes === "string" ? notes.trim() : "";
  if (!isLegacyServiceCategory(category)) {
    return trimmedNotes || null;
  }
  const marker = `${LEGACY_CATEGORY_PREFIX}${category}]]`;
  if (trimmedNotes.startsWith(marker)) {
    return trimmedNotes;
  }
  return trimmedNotes ? `${marker}\n${trimmedNotes}` : marker;
}

function decodeLegacyServiceFields(notes: string | null | undefined): { notes: string | null; category: LegacyServiceCategory | null } {
  if (typeof notes !== "string" || notes.length === 0) {
    return { notes: null, category: null };
  }
  const normalized = notes.replace(/\r\n/g, "\n");
  const match = normalized.match(/^\[\[strata:service-category=([a-z_]+)\]\](?:\n)?/);
  if (!match) return { notes, category: null };
  const category = isLegacyServiceCategory(match[1]) ? match[1] : null;
  const cleaned = normalized.slice(match[0].length).trim();
  return { notes: cleaned || null, category };
}

async function getServiceColumns(): Promise<Set<string>> {
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'services'
  `);
  const rows = (result as { rows?: Array<{ column_name?: string }> }).rows ?? [];
  return new Set(rows.map((row) => row.column_name).filter((value): value is string => Boolean(value)));
}

async function getCategoryColumns(): Promise<Set<string>> {
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'service_categories'
  `);
  const rows = (result as { rows?: Array<{ column_name?: string }> }).rows ?? [];
  return new Set(rows.map((row) => row.column_name).filter((value): value is string => Boolean(value)));
}

function buildLegacyServiceSelectColumns(columns: Set<string>): string {
  const selectColumns = [
    `s."id" as "id"`,
    `s."business_id" as "businessId"`,
    `s."name" as "name"`,
    columns.has("notes")
      ? `s."notes" as "notes"`
      : columns.has("description")
        ? `s."description" as "notes"`
        : `null::text as "notes"`,
    `s."price" as "price"`,
    columns.has("duration_minutes")
      ? `s."duration_minutes" as "durationMinutes"`
      : `null::integer as "durationMinutes"`,
    columns.has("category") ? `s."category" as "category"` : `null::text as "category"`,
    columns.has("category_id") ? `s."category_id" as "categoryId"` : `null::uuid as "categoryId"`,
    `c."name" as "categoryName"`,
    `c."sort_order" as "categorySortOrder"`,
    columns.has("sort_order") ? `s."sort_order" as "sortOrder"` : `0::integer as "sortOrder"`,
    columns.has("taxable") ? `s."taxable" as "taxable"` : `true as "taxable"`,
    columns.has("is_addon") ? `s."is_addon" as "isAddon"` : `false as "isAddon"`,
    columns.has("booking_enabled") ? `s."booking_enabled" as "bookingEnabled"` : `false as "bookingEnabled"`,
    columns.has("booking_flow_type") ? `s."booking_flow_type" as "bookingFlowType"` : `'inherit'::text as "bookingFlowType"`,
    columns.has("booking_description") ? `s."booking_description" as "bookingDescription"` : `null::text as "bookingDescription"`,
    columns.has("booking_deposit_amount") ? `s."booking_deposit_amount" as "bookingDepositAmount"` : `'0'::numeric as "bookingDepositAmount"`,
    columns.has("booking_lead_time_hours") ? `s."booking_lead_time_hours" as "bookingLeadTimeHours"` : `0::integer as "bookingLeadTimeHours"`,
    columns.has("booking_window_days") ? `s."booking_window_days" as "bookingWindowDays"` : `30::integer as "bookingWindowDays"`,
    columns.has("booking_request_require_exact_time") ? `s."booking_request_require_exact_time" as "bookingRequestRequireExactTime"` : `null::boolean as "bookingRequestRequireExactTime"`,
    columns.has("booking_request_allow_time_windows") ? `s."booking_request_allow_time_windows" as "bookingRequestAllowTimeWindows"` : `null::boolean as "bookingRequestAllowTimeWindows"`,
    columns.has("booking_request_allow_flexibility") ? `s."booking_request_allow_flexibility" as "bookingRequestAllowFlexibility"` : `null::boolean as "bookingRequestAllowFlexibility"`,
    columns.has("booking_request_review_message") ? `s."booking_request_review_message" as "bookingRequestReviewMessage"` : `null::text as "bookingRequestReviewMessage"`,
    columns.has("booking_request_allow_alternate_slots") ? `s."booking_request_allow_alternate_slots" as "bookingRequestAllowAlternateSlots"` : `null::boolean as "bookingRequestAllowAlternateSlots"`,
    columns.has("booking_request_alternate_slot_limit") ? `s."booking_request_alternate_slot_limit" as "bookingRequestAlternateSlotLimit"` : `null::integer as "bookingRequestAlternateSlotLimit"`,
    columns.has("booking_request_alternate_offer_expiry_hours") ? `s."booking_request_alternate_offer_expiry_hours" as "bookingRequestAlternateOfferExpiryHours"` : `null::integer as "bookingRequestAlternateOfferExpiryHours"`,
    columns.has("booking_service_mode") ? `s."booking_service_mode" as "bookingServiceMode"` : `'in_shop'::text as "bookingServiceMode"`,
    columns.has("booking_available_days") ? `s."booking_available_days" as "bookingAvailableDays"` : `null::text as "bookingAvailableDays"`,
    columns.has("booking_available_start_time") ? `s."booking_available_start_time" as "bookingAvailableStartTime"` : `null::text as "bookingAvailableStartTime"`,
    columns.has("booking_available_end_time") ? `s."booking_available_end_time" as "bookingAvailableEndTime"` : `null::text as "bookingAvailableEndTime"`,
    columns.has("booking_daily_hours") ? `s."booking_daily_hours" as "bookingDailyHours"` : `null::text as "bookingDailyHours"`,
    columns.has("booking_buffer_minutes") ? `s."booking_buffer_minutes" as "bookingBufferMinutes"` : `null::integer as "bookingBufferMinutes"`,
    columns.has("booking_capacity_per_slot") ? `s."booking_capacity_per_slot" as "bookingCapacityPerSlot"` : `null::integer as "bookingCapacityPerSlot"`,
    columns.has("booking_featured") ? `s."booking_featured" as "bookingFeatured"` : `false as "bookingFeatured"`,
    columns.has("booking_hide_price") ? `s."booking_hide_price" as "bookingHidePrice"` : `false as "bookingHidePrice"`,
    columns.has("booking_hide_duration") ? `s."booking_hide_duration" as "bookingHideDuration"` : `false as "bookingHideDuration"`,
    columns.has("active") ? `s."active" as "active"` : `true as "active"`,
    columns.has("created_at") ? `s."created_at" as "createdAt"` : `now() as "createdAt"`,
    columns.has("updated_at") ? `s."updated_at" as "updatedAt"` : `now() as "updatedAt"`,
  ];

  return selectColumns.join(", ");
}

async function listLegacyCompatibleServices(
  bid: string,
  columns: Set<string>,
  activeFilter?: boolean,
  first = 100
): Promise<ServiceRow[]> {
  const selectColumns = buildLegacyServiceSelectColumns(columns);
  const categoryColumns = await getCategoryColumns();
  const hasCategoryJoin =
    columns.has("category_id") &&
    categoryColumns.has("id") &&
    categoryColumns.has("name") &&
    categoryColumns.has("sort_order");
  const trailingOrder = sql.raw(columns.has("created_at") ? `s."created_at" desc` : `s."id" desc`);
  const categoryOrder = sql.raw(hasCategoryJoin ? `coalesce(c."sort_order", 9999) asc` : `9999 asc`);
  const serviceOrder = sql.raw(columns.has("sort_order") ? `coalesce(s."sort_order", 0) asc` : `0 asc`);
  const result =
    typeof activeFilter === "boolean" && columns.has("active")
      ? await db.execute(sql`
          select ${sql.raw(selectColumns)}
          from "services" s
          ${hasCategoryJoin ? sql.raw(`left join "service_categories" c on c."id" = s."category_id"`) : sql.raw(`left join (select null::uuid as "id", null::text as "name", null::integer as "sort_order") c on false`)}
          where s."business_id" = ${bid} and s."active" = ${activeFilter}
          order by ${categoryOrder}, ${serviceOrder}, s."name" asc, ${trailingOrder}
          limit ${first}
        `)
      : await db.execute(sql`
          select ${sql.raw(selectColumns)}
          from "services" s
          ${hasCategoryJoin ? sql.raw(`left join "service_categories" c on c."id" = s."category_id"`) : sql.raw(`left join (select null::uuid as "id", null::text as "name", null::integer as "sort_order") c on false`)}
          where s."business_id" = ${bid}
          order by ${categoryOrder}, ${serviceOrder}, s."name" asc, ${trailingOrder}
          limit ${first}
        `);

  const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  return rows.map((row) => normalizeServiceRecord(row as any));
}

async function getLegacyCompatibleService(id: string, bid: string, columns: Set<string>): Promise<ServiceRow | null> {
  const selectColumns = buildLegacyServiceSelectColumns(columns);
  const categoryColumns = await getCategoryColumns();
  const hasCategoryJoin =
    columns.has("category_id") &&
    categoryColumns.has("id") &&
    categoryColumns.has("name") &&
    categoryColumns.has("sort_order");
  const result = await db.execute(sql`
    select ${sql.raw(selectColumns)}
    from "services" s
    ${hasCategoryJoin ? sql.raw(`left join "service_categories" c on c."id" = s."category_id"`) : sql.raw(`left join (select null::uuid as "id", null::text as "name", null::integer as "sort_order") c on false`)}
    where s."id" = ${id} and s."business_id" = ${bid}
    limit 1
  `);

  const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  const row = rows[0];
  return row ? normalizeServiceRecord(row as any) : null;
}

function parseStoredNumberArray(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
  } catch {
    return [];
  }
}

function serializeBookingDailyHoursForStorage(value: unknown): string | null {
  const normalized = normalizeBookingDailyHours(value);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function assertBookingDailyHoursValid(value: unknown): void {
  const normalized = normalizeBookingDailyHours(value);
  for (const entry of normalized) {
    if (!entry.enabled) continue;
    const openMinutes = entry.openTime ? parseTimeToMinutes(entry.openTime) : null;
    const closeMinutes = entry.closeTime ? parseTimeToMinutes(entry.closeTime) : null;
    if (openMinutes == null || closeMinutes == null || closeMinutes <= openMinutes) {
      throw new BadRequestError("Each enabled service booking day needs a valid opening and closing time.");
    }
  }
}

type ServicePayload = z.infer<typeof createSchema>;

async function resolveCategoryAssignment(
  bid: string,
  payload: { category?: string | null; categoryId?: string | null }
): Promise<{ categoryId: string | null; legacyCategory: LegacyServiceCategory }> {
  if (payload.categoryId) {
    const [category] = await db
      .select({ id: serviceCategories.id, key: serviceCategories.key })
      .from(serviceCategories)
      .where(and(eq(serviceCategories.id, payload.categoryId), eq(serviceCategories.businessId, bid)))
      .limit(1);
    if (!category) throw new BadRequestError("Service category not found.");
    return {
      categoryId: category.id,
      legacyCategory: category.key && isLegacyServiceCategory(category.key) ? category.key : "other",
    };
  }

  if (payload.category && isLegacyServiceCategory(payload.category)) {
    const mapping = await ensureBusinessServiceCategories(bid, [
      {
        key: payload.category,
        name: formatLegacyServiceCategory(payload.category),
        sortOrder: LEGACY_SERVICE_CATEGORIES.findIndex((category) => category.key === payload.category),
      },
    ]);
    return {
      categoryId: mapping.get(payload.category) ?? null,
      legacyCategory: payload.category,
    };
  }

  return { categoryId: null, legacyCategory: "other" };
}

async function insertLegacyServiceRecord(
  bid: string,
  serviceId: string,
  body: ServicePayload,
  resolvedCategory: { categoryId: string | null; legacyCategory: LegacyServiceCategory }
): Promise<string | null> {
  const columns = await getServiceColumns();
  const insertColumns = ["id", "business_id", "name", "price"];
  const insertValues: unknown[] = [serviceId, bid, body.name, String(body.price)];
  const now = new Date();

  if (columns.has("duration_minutes")) {
    insertColumns.push("duration_minutes");
    insertValues.push(body.durationMinutes ?? null);
  }
  if (columns.has("category")) {
    insertColumns.push("category");
    insertValues.push(resolvedCategory.legacyCategory);
  }
  if (columns.has("category_id")) {
    insertColumns.push("category_id");
    insertValues.push(resolvedCategory.categoryId);
  }
  if (columns.has("sort_order")) {
    insertColumns.push("sort_order");
    insertValues.push(body.sortOrder ?? 0);
  }
  if (columns.has("notes")) {
    insertColumns.push("notes");
    insertValues.push(encodeLegacyServiceNotes(body.notes ?? null, resolvedCategory.legacyCategory));
  }
  if (columns.has("taxable")) {
    insertColumns.push("taxable");
    insertValues.push(body.taxable ?? true);
  }
  if (columns.has("is_addon")) {
    insertColumns.push("is_addon");
    insertValues.push(body.isAddon ?? false);
  }
  if (columns.has("booking_enabled")) {
    insertColumns.push("booking_enabled");
    insertValues.push(body.bookingEnabled ?? false);
  }
  if (columns.has("booking_flow_type")) {
    insertColumns.push("booking_flow_type");
    insertValues.push(body.bookingFlowType ?? "inherit");
  }
  if (columns.has("booking_description")) {
    insertColumns.push("booking_description");
    insertValues.push(body.bookingDescription ?? null);
  }
  if (columns.has("booking_deposit_amount")) {
    insertColumns.push("booking_deposit_amount");
    insertValues.push(String(body.bookingDepositAmount ?? 0));
  }
  if (columns.has("booking_lead_time_hours")) {
    insertColumns.push("booking_lead_time_hours");
    insertValues.push(body.bookingLeadTimeHours ?? 0);
  }
  if (columns.has("booking_window_days")) {
    insertColumns.push("booking_window_days");
    insertValues.push(body.bookingWindowDays ?? 30);
  }
  if (columns.has("booking_request_require_exact_time")) {
    insertColumns.push("booking_request_require_exact_time");
    insertValues.push(body.bookingRequestRequireExactTime ?? null);
  }
  if (columns.has("booking_request_allow_time_windows")) {
    insertColumns.push("booking_request_allow_time_windows");
    insertValues.push(body.bookingRequestAllowTimeWindows ?? null);
  }
  if (columns.has("booking_request_allow_flexibility")) {
    insertColumns.push("booking_request_allow_flexibility");
    insertValues.push(body.bookingRequestAllowFlexibility ?? null);
  }
  if (columns.has("booking_request_review_message")) {
    insertColumns.push("booking_request_review_message");
    insertValues.push(body.bookingRequestReviewMessage ?? null);
  }
  if (columns.has("booking_request_allow_alternate_slots")) {
    insertColumns.push("booking_request_allow_alternate_slots");
    insertValues.push(body.bookingRequestAllowAlternateSlots ?? null);
  }
  if (columns.has("booking_request_alternate_slot_limit")) {
    insertColumns.push("booking_request_alternate_slot_limit");
    insertValues.push(
      body.bookingRequestAlternateSlotLimit != null
        ? normalizeBookingRequestAlternateSlotLimit(body.bookingRequestAlternateSlotLimit)
        : null
    );
  }
  if (columns.has("booking_request_alternate_offer_expiry_hours")) {
    insertColumns.push("booking_request_alternate_offer_expiry_hours");
    insertValues.push(
      body.bookingRequestAlternateOfferExpiryHours != null
        ? normalizeBookingRequestAlternateOfferExpiryHours(body.bookingRequestAlternateOfferExpiryHours)
        : null
    );
  }
  if (columns.has("booking_service_mode")) {
    insertColumns.push("booking_service_mode");
    insertValues.push(body.bookingServiceMode ?? "in_shop");
  }
  if (columns.has("booking_available_days")) {
    insertColumns.push("booking_available_days");
    insertValues.push(body.bookingAvailableDays ? JSON.stringify(body.bookingAvailableDays) : null);
  }
  if (columns.has("booking_available_start_time")) {
    insertColumns.push("booking_available_start_time");
    insertValues.push(body.bookingAvailableStartTime ?? null);
  }
  if (columns.has("booking_available_end_time")) {
    insertColumns.push("booking_available_end_time");
    insertValues.push(body.bookingAvailableEndTime ?? null);
  }
  if (columns.has("booking_daily_hours")) {
    insertColumns.push("booking_daily_hours");
    insertValues.push(serializeBookingDailyHoursForStorage(body.bookingDailyHours));
  }
  if (columns.has("booking_buffer_minutes")) {
    insertColumns.push("booking_buffer_minutes");
    insertValues.push(body.bookingBufferMinutes ?? null);
  }
  if (columns.has("booking_capacity_per_slot")) {
    insertColumns.push("booking_capacity_per_slot");
    insertValues.push(body.bookingCapacityPerSlot ?? null);
  }
  if (columns.has("booking_featured")) {
    insertColumns.push("booking_featured");
    insertValues.push(body.bookingFeatured ?? false);
  }
  if (columns.has("booking_hide_price")) {
    insertColumns.push("booking_hide_price");
    insertValues.push(body.bookingHidePrice ?? false);
  }
  if (columns.has("booking_hide_duration")) {
    insertColumns.push("booking_hide_duration");
    insertValues.push(body.bookingHideDuration ?? false);
  }
  if (columns.has("active")) {
    insertColumns.push("active");
    insertValues.push(body.active ?? true);
  }
  if (columns.has("created_at")) {
    insertColumns.push("created_at");
    insertValues.push(now);
  }
  if (columns.has("updated_at")) {
    insertColumns.push("updated_at");
    insertValues.push(now);
  }

  const result = await db.execute(sql`insert into "services" (${sql.join(
    insertColumns.map((column) => sql.raw(`"${column}"`)),
    sql`, `
  )}) values (${sql.join(insertValues.map((value) => sql`${value}`), sql`, `)}) returning "id"`);
  const rows = (result as { rows?: Array<{ id?: string }> }).rows ?? [];
  return rows[0]?.id ?? null;
}

async function updateLegacyServiceRecord(
  bid: string,
  serviceId: string,
  body: z.infer<typeof patchSchema>,
  existing: ServiceRow,
  resolvedCategory: { categoryId: string | null; legacyCategory: LegacyServiceCategory }
): Promise<void> {
  const columns = await getServiceColumns();
  const updates: Array<{ column: string; value: unknown }> = [];

  if (body.name !== undefined) updates.push({ column: "name", value: body.name });
  if (body.price !== undefined) updates.push({ column: "price", value: String(body.price) });
  if (body.durationMinutes !== undefined && columns.has("duration_minutes")) {
    updates.push({ column: "duration_minutes", value: body.durationMinutes });
  }
  if ((body.category !== undefined || body.categoryId !== undefined) && columns.has("category")) {
    updates.push({ column: "category", value: resolvedCategory.legacyCategory });
  }
  if ((body.category !== undefined || body.categoryId !== undefined) && columns.has("category_id")) {
    updates.push({ column: "category_id", value: resolvedCategory.categoryId });
  }
  if (body.sortOrder !== undefined && columns.has("sort_order")) {
    updates.push({ column: "sort_order", value: body.sortOrder });
  }
  if (body.notes !== undefined || body.category !== undefined || body.categoryId !== undefined) {
    const encodedNotes = encodeLegacyServiceNotes(
      body.notes !== undefined ? body.notes : existing.notes,
      resolvedCategory.legacyCategory
    );
    if (columns.has("notes")) updates.push({ column: "notes", value: encodedNotes });
    else if (columns.has("description")) updates.push({ column: "description", value: encodedNotes });
  }
  if (body.taxable !== undefined && columns.has("taxable")) updates.push({ column: "taxable", value: body.taxable });
  if (body.isAddon !== undefined && columns.has("is_addon")) updates.push({ column: "is_addon", value: body.isAddon });
  if (body.bookingEnabled !== undefined && columns.has("booking_enabled")) {
    updates.push({ column: "booking_enabled", value: body.bookingEnabled });
  }
  if (body.bookingFlowType !== undefined && columns.has("booking_flow_type")) {
    updates.push({ column: "booking_flow_type", value: body.bookingFlowType });
  }
  if (body.bookingDescription !== undefined && columns.has("booking_description")) {
    updates.push({ column: "booking_description", value: body.bookingDescription });
  }
  if (body.bookingDepositAmount !== undefined && columns.has("booking_deposit_amount")) {
    updates.push({ column: "booking_deposit_amount", value: String(body.bookingDepositAmount ?? 0) });
  }
  if (body.bookingLeadTimeHours !== undefined && columns.has("booking_lead_time_hours")) {
    updates.push({ column: "booking_lead_time_hours", value: body.bookingLeadTimeHours });
  }
  if (body.bookingWindowDays !== undefined && columns.has("booking_window_days")) {
    updates.push({ column: "booking_window_days", value: body.bookingWindowDays });
  }
  if (body.bookingRequestRequireExactTime !== undefined && columns.has("booking_request_require_exact_time")) {
    updates.push({ column: "booking_request_require_exact_time", value: body.bookingRequestRequireExactTime });
  }
  if (body.bookingRequestAllowTimeWindows !== undefined && columns.has("booking_request_allow_time_windows")) {
    updates.push({ column: "booking_request_allow_time_windows", value: body.bookingRequestAllowTimeWindows });
  }
  if (body.bookingRequestAllowFlexibility !== undefined && columns.has("booking_request_allow_flexibility")) {
    updates.push({ column: "booking_request_allow_flexibility", value: body.bookingRequestAllowFlexibility });
  }
  if (body.bookingRequestReviewMessage !== undefined && columns.has("booking_request_review_message")) {
    updates.push({
      column: "booking_request_review_message",
      value: body.bookingRequestReviewMessage?.trim() || null,
    });
  }
  if (body.bookingRequestAllowAlternateSlots !== undefined && columns.has("booking_request_allow_alternate_slots")) {
    updates.push({
      column: "booking_request_allow_alternate_slots",
      value: body.bookingRequestAllowAlternateSlots,
    });
  }
  if (body.bookingRequestAlternateSlotLimit !== undefined && columns.has("booking_request_alternate_slot_limit")) {
    updates.push({
      column: "booking_request_alternate_slot_limit",
      value:
        body.bookingRequestAlternateSlotLimit != null
          ? normalizeBookingRequestAlternateSlotLimit(body.bookingRequestAlternateSlotLimit)
          : null,
    });
  }
  if (
    body.bookingRequestAlternateOfferExpiryHours !== undefined &&
    columns.has("booking_request_alternate_offer_expiry_hours")
  ) {
    updates.push({
      column: "booking_request_alternate_offer_expiry_hours",
      value:
        body.bookingRequestAlternateOfferExpiryHours != null
          ? normalizeBookingRequestAlternateOfferExpiryHours(body.bookingRequestAlternateOfferExpiryHours)
          : null,
    });
  }
  if (body.bookingServiceMode !== undefined && columns.has("booking_service_mode")) {
    updates.push({ column: "booking_service_mode", value: body.bookingServiceMode });
  }
  if (body.bookingAvailableDays !== undefined && columns.has("booking_available_days")) {
    updates.push({
      column: "booking_available_days",
      value: body.bookingAvailableDays ? JSON.stringify(body.bookingAvailableDays) : null,
    });
  }
  if (body.bookingAvailableStartTime !== undefined && columns.has("booking_available_start_time")) {
    updates.push({ column: "booking_available_start_time", value: body.bookingAvailableStartTime ?? null });
  }
  if (body.bookingAvailableEndTime !== undefined && columns.has("booking_available_end_time")) {
    updates.push({ column: "booking_available_end_time", value: body.bookingAvailableEndTime ?? null });
  }
  if (body.bookingDailyHours !== undefined && columns.has("booking_daily_hours")) {
    updates.push({ column: "booking_daily_hours", value: serializeBookingDailyHoursForStorage(body.bookingDailyHours) });
  }
  if (body.bookingBufferMinutes !== undefined && columns.has("booking_buffer_minutes")) {
    updates.push({ column: "booking_buffer_minutes", value: body.bookingBufferMinutes ?? null });
  }
  if (body.bookingCapacityPerSlot !== undefined && columns.has("booking_capacity_per_slot")) {
    updates.push({ column: "booking_capacity_per_slot", value: body.bookingCapacityPerSlot ?? null });
  }
  if (body.bookingFeatured !== undefined && columns.has("booking_featured")) {
    updates.push({ column: "booking_featured", value: body.bookingFeatured });
  }
  if (body.bookingHidePrice !== undefined && columns.has("booking_hide_price")) {
    updates.push({ column: "booking_hide_price", value: body.bookingHidePrice });
  }
  if (body.bookingHideDuration !== undefined && columns.has("booking_hide_duration")) {
    updates.push({ column: "booking_hide_duration", value: body.bookingHideDuration });
  }
  if (body.active !== undefined && columns.has("active")) updates.push({ column: "active", value: body.active });
  if (columns.has("updated_at")) updates.push({ column: "updated_at", value: new Date() });

  if (updates.length === 0) return;

  await db.execute(sql`
    update "services"
    set ${sql.join(updates.map(({ column, value }) => sql`${sql.raw(`"${column}"`)} = ${value}`), sql`, `)}
    where "id" = ${serviceId} and "business_id" = ${bid}
  `);
}

function normalizeServiceRecord(row: {
  id: string;
  businessId: string;
  name: string;
  notes: string | null;
  price: string | null;
  durationMinutes: number | null;
  category: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  categorySortOrder?: number | null;
  sortOrder?: number | null;
  taxable?: boolean | null;
  isAddon?: boolean | null;
  bookingEnabled?: boolean | null;
  bookingFlowType?: string | null;
  bookingDescription?: string | null;
  bookingDepositAmount?: string | null;
  bookingLeadTimeHours?: number | null;
  bookingWindowDays?: number | null;
  bookingRequestRequireExactTime?: boolean | null;
  bookingRequestAllowTimeWindows?: boolean | null;
  bookingRequestAllowFlexibility?: boolean | null;
  bookingRequestReviewMessage?: string | null;
  bookingRequestAllowAlternateSlots?: boolean | null;
  bookingRequestAlternateSlotLimit?: number | null;
  bookingRequestAlternateOfferExpiryHours?: number | null;
  bookingServiceMode?: string | null;
  bookingAvailableDays?: string | null;
  bookingAvailableStartTime?: string | null;
  bookingAvailableEndTime?: string | null;
  bookingDailyHours?: string | null;
  bookingBufferMinutes?: number | null;
  bookingCapacityPerSlot?: number | null;
  bookingFeatured?: boolean | null;
  bookingHidePrice?: boolean | null;
  bookingHideDuration?: boolean | null;
  active?: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}): ServiceRow {
  const decoded = decodeLegacyServiceFields(row.notes);
  const legacyCategory = isLegacyServiceCategory(row.category) ? row.category : decoded.category ?? "other";
  const categoryKey =
    row.categoryName && !isLegacyServiceCategory(row.category) && !decoded.category ? row.categoryName : legacyCategory;

  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    notes: decoded.notes,
    price: row.price,
    durationMinutes: row.durationMinutes ?? null,
    category: categoryKey,
    categoryId: row.categoryId ?? null,
    categoryLabel: row.categoryName ?? formatLegacyServiceCategory(legacyCategory),
    categorySortOrder: row.categorySortOrder ?? null,
    sortOrder: row.sortOrder ?? 0,
    taxable: row.taxable ?? true,
    isAddon: row.isAddon ?? false,
    bookingEnabled: row.bookingEnabled ?? false,
    bookingFlowType: row.bookingFlowType ?? "inherit",
    bookingDescription: row.bookingDescription ?? null,
    bookingDepositAmount: row.bookingDepositAmount ?? "0",
    bookingLeadTimeHours: row.bookingLeadTimeHours ?? 0,
    bookingWindowDays: row.bookingWindowDays ?? 30,
    bookingRequestRequireExactTime: row.bookingRequestRequireExactTime ?? null,
    bookingRequestAllowTimeWindows: row.bookingRequestAllowTimeWindows ?? null,
    bookingRequestAllowFlexibility: row.bookingRequestAllowFlexibility ?? null,
    bookingRequestReviewMessage: row.bookingRequestReviewMessage ?? null,
    bookingRequestAllowAlternateSlots: row.bookingRequestAllowAlternateSlots ?? null,
    bookingRequestAlternateSlotLimit: row.bookingRequestAlternateSlotLimit ?? null,
    bookingRequestAlternateOfferExpiryHours: row.bookingRequestAlternateOfferExpiryHours ?? null,
    bookingServiceMode: normalizeBookingServiceMode(row.bookingServiceMode),
    bookingAvailableDays: parseStoredNumberArray(row.bookingAvailableDays),
    bookingAvailableStartTime:
      parseTimeToMinutes(row.bookingAvailableStartTime ?? "") != null ? row.bookingAvailableStartTime ?? null : null,
    bookingAvailableEndTime:
      parseTimeToMinutes(row.bookingAvailableEndTime ?? "") != null ? row.bookingAvailableEndTime ?? null : null,
    bookingDailyHours: parseBookingDailyHours(row.bookingDailyHours),
    bookingBufferMinutes: row.bookingBufferMinutes ?? null,
    bookingCapacityPerSlot: row.bookingCapacityPerSlot ?? null,
    bookingFeatured: row.bookingFeatured ?? false,
    bookingHidePrice: row.bookingHidePrice ?? false,
    bookingHideDuration: row.bookingHideDuration ?? false,
    active: row.active ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listServicesForBusiness(bid: string, activeFilter?: boolean, first = 100): Promise<ServiceRow[]> {
  const serviceColumns = await getServiceColumns();
  const hasLegacyCategory = serviceColumns.has("category");
  const hasCategoryId = serviceColumns.has("category_id");
  const hasSortOrder = serviceColumns.has("sort_order");
  const hasTaxable = serviceColumns.has("taxable");
  const hasIsAddon = serviceColumns.has("is_addon");
  const hasBookingEnabled = serviceColumns.has("booking_enabled");
  const hasBookingFlowType = serviceColumns.has("booking_flow_type");
  const hasBookingDescription = serviceColumns.has("booking_description");
  const hasBookingDepositAmount = serviceColumns.has("booking_deposit_amount");
  const hasBookingLeadTimeHours = serviceColumns.has("booking_lead_time_hours");
  const hasBookingWindowDays = serviceColumns.has("booking_window_days");
  const hasBookingRequestRequireExactTime = serviceColumns.has("booking_request_require_exact_time");
  const hasBookingRequestAllowTimeWindows = serviceColumns.has("booking_request_allow_time_windows");
  const hasBookingRequestAllowFlexibility = serviceColumns.has("booking_request_allow_flexibility");
  const hasBookingRequestReviewMessage = serviceColumns.has("booking_request_review_message");
  const hasBookingRequestAllowAlternateSlots = serviceColumns.has("booking_request_allow_alternate_slots");
  const hasBookingRequestAlternateSlotLimit = serviceColumns.has("booking_request_alternate_slot_limit");
  const hasBookingRequestAlternateOfferExpiryHours = serviceColumns.has("booking_request_alternate_offer_expiry_hours");
  const hasBookingServiceMode = serviceColumns.has("booking_service_mode");
  const hasBookingAvailableDays = serviceColumns.has("booking_available_days");
  const hasBookingAvailableStartTime = serviceColumns.has("booking_available_start_time");
  const hasBookingAvailableEndTime = serviceColumns.has("booking_available_end_time");
  const hasBookingDailyHours = serviceColumns.has("booking_daily_hours");
  const hasBookingBufferMinutes = serviceColumns.has("booking_buffer_minutes");
  const hasBookingCapacityPerSlot = serviceColumns.has("booking_capacity_per_slot");
  const hasBookingFeatured = serviceColumns.has("booking_featured");
  const hasBookingHidePrice = serviceColumns.has("booking_hide_price");
  const hasBookingHideDuration = serviceColumns.has("booking_hide_duration");
  const hasActive = serviceColumns.has("active");
  const conditions = [eq(services.businessId, bid)];
  if (typeof activeFilter === "boolean" && hasActive) conditions.push(eq(services.active, activeFilter));

  try {
    const rows = await db
      .select({
        id: services.id,
        businessId: services.businessId,
        name: services.name,
        notes: services.notes,
        price: services.price,
        durationMinutes: services.durationMinutes,
        category: hasLegacyCategory ? services.category : sql<string | null>`null`,
        categoryId: hasCategoryId ? services.categoryId : sql<string | null>`null`,
        categoryName: hasCategoryId ? serviceCategories.name : sql<string | null>`null`,
        categorySortOrder: hasCategoryId ? serviceCategories.sortOrder : sql<number | null>`null`,
        sortOrder: hasSortOrder ? services.sortOrder : sql<number | null>`0`,
        taxable: hasTaxable ? services.taxable : sql<boolean | null>`true`,
        isAddon: hasIsAddon ? services.isAddon : sql<boolean | null>`false`,
        bookingEnabled: hasBookingEnabled ? services.bookingEnabled : sql<boolean | null>`false`,
        bookingFlowType: hasBookingFlowType ? services.bookingFlowType : sql<string | null>`'inherit'`,
        bookingDescription: hasBookingDescription ? services.bookingDescription : sql<string | null>`null`,
        bookingDepositAmount: hasBookingDepositAmount ? services.bookingDepositAmount : sql<string | null>`'0'`,
        bookingLeadTimeHours: hasBookingLeadTimeHours ? services.bookingLeadTimeHours : sql<number | null>`0`,
        bookingWindowDays: hasBookingWindowDays ? services.bookingWindowDays : sql<number | null>`30`,
        bookingRequestRequireExactTime: hasBookingRequestRequireExactTime
          ? services.bookingRequestRequireExactTime
          : sql<boolean | null>`null`,
        bookingRequestAllowTimeWindows: hasBookingRequestAllowTimeWindows
          ? services.bookingRequestAllowTimeWindows
          : sql<boolean | null>`null`,
        bookingRequestAllowFlexibility: hasBookingRequestAllowFlexibility
          ? services.bookingRequestAllowFlexibility
          : sql<boolean | null>`null`,
        bookingRequestReviewMessage: hasBookingRequestReviewMessage
          ? services.bookingRequestReviewMessage
          : sql<string | null>`null`,
        bookingRequestAllowAlternateSlots: hasBookingRequestAllowAlternateSlots
          ? services.bookingRequestAllowAlternateSlots
          : sql<boolean | null>`null`,
        bookingRequestAlternateSlotLimit: hasBookingRequestAlternateSlotLimit
          ? services.bookingRequestAlternateSlotLimit
          : sql<number | null>`null`,
        bookingRequestAlternateOfferExpiryHours: hasBookingRequestAlternateOfferExpiryHours
          ? services.bookingRequestAlternateOfferExpiryHours
          : sql<number | null>`null`,
        bookingServiceMode: hasBookingServiceMode ? services.bookingServiceMode : sql<string | null>`'in_shop'`,
        bookingAvailableDays: hasBookingAvailableDays ? services.bookingAvailableDays : sql<string | null>`null`,
        bookingAvailableStartTime: hasBookingAvailableStartTime ? services.bookingAvailableStartTime : sql<string | null>`null`,
        bookingAvailableEndTime: hasBookingAvailableEndTime ? services.bookingAvailableEndTime : sql<string | null>`null`,
        bookingDailyHours: hasBookingDailyHours ? services.bookingDailyHours : sql<string | null>`null`,
        bookingBufferMinutes: hasBookingBufferMinutes ? services.bookingBufferMinutes : sql<number | null>`null`,
        bookingCapacityPerSlot: hasBookingCapacityPerSlot ? services.bookingCapacityPerSlot : sql<number | null>`null`,
        bookingFeatured: hasBookingFeatured ? services.bookingFeatured : sql<boolean | null>`false`,
        bookingHidePrice: hasBookingHidePrice ? services.bookingHidePrice : sql<boolean | null>`false`,
        bookingHideDuration: hasBookingHideDuration ? services.bookingHideDuration : sql<boolean | null>`false`,
        active: hasActive ? services.active : sql<boolean | null>`true`,
        createdAt: services.createdAt,
        updatedAt: services.updatedAt,
      })
      .from(services)
      .leftJoin(serviceCategories, hasCategoryId ? eq(services.categoryId, serviceCategories.id) : sql`false`)
      .where(and(...conditions))
      .orderBy(
        hasCategoryId ? asc(serviceCategories.sortOrder) : sql`1`,
        hasSortOrder ? asc(services.sortOrder) : sql`1`,
        asc(services.name),
        desc(services.createdAt)
      )
      .limit(first);
    return rows.map((row) => normalizeServiceRecord(row));
  } catch (error) {
    if (!isServiceSchemaDriftError(error)) throw error;
    warnOnce("services:list:fallback", "services list falling back without category schema", {
      businessId: bid,
      error: error instanceof Error ? error.message : String(error),
    });
    return listLegacyCompatibleServices(bid, serviceColumns, activeFilter, first);
  }
}

async function getServiceForBusiness(id: string, bid: string): Promise<ServiceRow | null> {
  const serviceColumns = await getServiceColumns();
  const hasLegacyCategory = serviceColumns.has("category");
  const hasCategoryId = serviceColumns.has("category_id");
  const hasSortOrder = serviceColumns.has("sort_order");
  const hasTaxable = serviceColumns.has("taxable");
  const hasIsAddon = serviceColumns.has("is_addon");
  const hasBookingEnabled = serviceColumns.has("booking_enabled");
  const hasBookingFlowType = serviceColumns.has("booking_flow_type");
  const hasBookingDescription = serviceColumns.has("booking_description");
  const hasBookingDepositAmount = serviceColumns.has("booking_deposit_amount");
  const hasBookingLeadTimeHours = serviceColumns.has("booking_lead_time_hours");
  const hasBookingWindowDays = serviceColumns.has("booking_window_days");
  const hasBookingRequestRequireExactTime = serviceColumns.has("booking_request_require_exact_time");
  const hasBookingRequestAllowTimeWindows = serviceColumns.has("booking_request_allow_time_windows");
  const hasBookingRequestAllowFlexibility = serviceColumns.has("booking_request_allow_flexibility");
  const hasBookingRequestReviewMessage = serviceColumns.has("booking_request_review_message");
  const hasBookingRequestAllowAlternateSlots = serviceColumns.has("booking_request_allow_alternate_slots");
  const hasBookingRequestAlternateSlotLimit = serviceColumns.has("booking_request_alternate_slot_limit");
  const hasBookingRequestAlternateOfferExpiryHours = serviceColumns.has("booking_request_alternate_offer_expiry_hours");
  const hasBookingServiceMode = serviceColumns.has("booking_service_mode");
  const hasBookingAvailableDays = serviceColumns.has("booking_available_days");
  const hasBookingAvailableStartTime = serviceColumns.has("booking_available_start_time");
  const hasBookingAvailableEndTime = serviceColumns.has("booking_available_end_time");
  const hasBookingDailyHours = serviceColumns.has("booking_daily_hours");
  const hasBookingBufferMinutes = serviceColumns.has("booking_buffer_minutes");
  const hasBookingCapacityPerSlot = serviceColumns.has("booking_capacity_per_slot");
  const hasBookingFeatured = serviceColumns.has("booking_featured");
  const hasBookingHidePrice = serviceColumns.has("booking_hide_price");
  const hasBookingHideDuration = serviceColumns.has("booking_hide_duration");
  const hasActive = serviceColumns.has("active");

  try {
    const [row] = await db
      .select({
        id: services.id,
        businessId: services.businessId,
        name: services.name,
        notes: services.notes,
        price: services.price,
        durationMinutes: services.durationMinutes,
        category: hasLegacyCategory ? services.category : sql<string | null>`null`,
        categoryId: hasCategoryId ? services.categoryId : sql<string | null>`null`,
        categoryName: hasCategoryId ? serviceCategories.name : sql<string | null>`null`,
        categorySortOrder: hasCategoryId ? serviceCategories.sortOrder : sql<number | null>`null`,
        sortOrder: hasSortOrder ? services.sortOrder : sql<number | null>`0`,
        taxable: hasTaxable ? services.taxable : sql<boolean | null>`true`,
        isAddon: hasIsAddon ? services.isAddon : sql<boolean | null>`false`,
        bookingEnabled: hasBookingEnabled ? services.bookingEnabled : sql<boolean | null>`false`,
        bookingFlowType: hasBookingFlowType ? services.bookingFlowType : sql<string | null>`'inherit'`,
        bookingDescription: hasBookingDescription ? services.bookingDescription : sql<string | null>`null`,
        bookingDepositAmount: hasBookingDepositAmount ? services.bookingDepositAmount : sql<string | null>`'0'`,
        bookingLeadTimeHours: hasBookingLeadTimeHours ? services.bookingLeadTimeHours : sql<number | null>`0`,
        bookingWindowDays: hasBookingWindowDays ? services.bookingWindowDays : sql<number | null>`30`,
        bookingRequestRequireExactTime: hasBookingRequestRequireExactTime
          ? services.bookingRequestRequireExactTime
          : sql<boolean | null>`null`,
        bookingRequestAllowTimeWindows: hasBookingRequestAllowTimeWindows
          ? services.bookingRequestAllowTimeWindows
          : sql<boolean | null>`null`,
        bookingRequestAllowFlexibility: hasBookingRequestAllowFlexibility
          ? services.bookingRequestAllowFlexibility
          : sql<boolean | null>`null`,
        bookingRequestReviewMessage: hasBookingRequestReviewMessage
          ? services.bookingRequestReviewMessage
          : sql<string | null>`null`,
        bookingRequestAllowAlternateSlots: hasBookingRequestAllowAlternateSlots
          ? services.bookingRequestAllowAlternateSlots
          : sql<boolean | null>`null`,
        bookingRequestAlternateSlotLimit: hasBookingRequestAlternateSlotLimit
          ? services.bookingRequestAlternateSlotLimit
          : sql<number | null>`null`,
        bookingRequestAlternateOfferExpiryHours: hasBookingRequestAlternateOfferExpiryHours
          ? services.bookingRequestAlternateOfferExpiryHours
          : sql<number | null>`null`,
        bookingServiceMode: hasBookingServiceMode ? services.bookingServiceMode : sql<string | null>`'in_shop'`,
        bookingAvailableDays: hasBookingAvailableDays ? services.bookingAvailableDays : sql<string | null>`null`,
        bookingAvailableStartTime: hasBookingAvailableStartTime ? services.bookingAvailableStartTime : sql<string | null>`null`,
        bookingAvailableEndTime: hasBookingAvailableEndTime ? services.bookingAvailableEndTime : sql<string | null>`null`,
        bookingDailyHours: hasBookingDailyHours ? services.bookingDailyHours : sql<string | null>`null`,
        bookingBufferMinutes: hasBookingBufferMinutes ? services.bookingBufferMinutes : sql<number | null>`null`,
        bookingCapacityPerSlot: hasBookingCapacityPerSlot ? services.bookingCapacityPerSlot : sql<number | null>`null`,
        bookingFeatured: hasBookingFeatured ? services.bookingFeatured : sql<boolean | null>`false`,
        bookingHidePrice: hasBookingHidePrice ? services.bookingHidePrice : sql<boolean | null>`false`,
        bookingHideDuration: hasBookingHideDuration ? services.bookingHideDuration : sql<boolean | null>`false`,
        active: hasActive ? services.active : sql<boolean | null>`true`,
        createdAt: services.createdAt,
        updatedAt: services.updatedAt,
      })
      .from(services)
      .leftJoin(serviceCategories, hasCategoryId ? eq(services.categoryId, serviceCategories.id) : sql`false`)
      .where(and(eq(services.id, id), eq(services.businessId, bid)))
      .limit(1);
    return row ? normalizeServiceRecord(row) : null;
  } catch (error) {
    if (!isServiceSchemaDriftError(error)) throw error;
    return getLegacyCompatibleService(id, bid, serviceColumns);
  }
}

const bookingDailyHoursSchema = z
  .array(
    z.object({
      dayIndex: z.number().int().min(0).max(6),
      enabled: z.boolean(),
      openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
      closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    })
  )
  .max(7)
  .nullable()
  .optional();

const createSchema = z.object({
  name: z.string().min(1),
  price: z.coerce.number().min(0),
  durationMinutes: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
  category: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
  taxable: z.boolean().optional(),
  isAddon: z.boolean().optional(),
  bookingEnabled: z.boolean().optional(),
  bookingFlowType: z.enum(["inherit", "request", "self_book"]).optional(),
  bookingDescription: z.string().nullable().optional(),
  bookingDepositAmount: z.coerce.number().min(0).max(100000).optional(),
  bookingLeadTimeHours: z.coerce.number().int().min(0).max(336).optional(),
  bookingWindowDays: z.coerce.number().int().min(1).max(180).optional(),
  bookingRequestRequireExactTime: z.boolean().nullable().optional(),
  bookingRequestAllowTimeWindows: z.boolean().nullable().optional(),
  bookingRequestAllowFlexibility: z.boolean().nullable().optional(),
  bookingRequestReviewMessage: z.string().max(360).nullable().optional(),
  bookingRequestAllowAlternateSlots: z.boolean().nullable().optional(),
  bookingRequestAlternateSlotLimit: z.coerce.number().int().min(1).max(3).nullable().optional(),
  bookingRequestAlternateOfferExpiryHours: z.coerce.number().int().min(1).max(168).nullable().optional(),
  bookingServiceMode: z.enum(["in_shop", "mobile", "both"]).optional(),
  bookingAvailableDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  bookingAvailableStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  bookingAvailableEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  bookingDailyHours: bookingDailyHoursSchema,
  bookingBufferMinutes: z.coerce.number().int().min(0).max(240).nullable().optional(),
  bookingCapacityPerSlot: z.coerce.number().int().min(1).max(12).nullable().optional(),
  bookingFeatured: z.boolean().optional(),
  bookingHidePrice: z.boolean().optional(),
  bookingHideDuration: z.boolean().optional(),
  active: z.boolean().optional(),
  business: z.object({ _link: z.string().uuid() }).optional(),
});

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    price: z.coerce.number().min(0).optional(),
    durationMinutes: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
    category: z.string().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
    taxable: z.boolean().optional(),
    isAddon: z.boolean().optional(),
    bookingEnabled: z.boolean().optional(),
    bookingFlowType: z.enum(["inherit", "request", "self_book"]).optional(),
    bookingDescription: z.union([z.string(), z.null()]).optional(),
    bookingDepositAmount: z.coerce.number().min(0).max(100000).optional(),
    bookingLeadTimeHours: z.coerce.number().int().min(0).max(336).optional(),
    bookingWindowDays: z.coerce.number().int().min(1).max(180).optional(),
    bookingRequestRequireExactTime: z.boolean().nullable().optional(),
    bookingRequestAllowTimeWindows: z.boolean().nullable().optional(),
    bookingRequestAllowFlexibility: z.boolean().nullable().optional(),
    bookingRequestReviewMessage: z.union([z.string().max(360), z.null()]).optional(),
    bookingRequestAllowAlternateSlots: z.boolean().nullable().optional(),
    bookingRequestAlternateSlotLimit: z.coerce.number().int().min(1).max(3).nullable().optional(),
    bookingRequestAlternateOfferExpiryHours: z.coerce.number().int().min(1).max(168).nullable().optional(),
    bookingServiceMode: z.enum(["in_shop", "mobile", "both"]).optional(),
    bookingAvailableDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    bookingAvailableStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    bookingAvailableEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    bookingDailyHours: bookingDailyHoursSchema,
    bookingBufferMinutes: z.coerce.number().int().min(0).max(240).nullable().optional(),
    bookingCapacityPerSlot: z.coerce.number().int().min(1).max(12).nullable().optional(),
    bookingFeatured: z.boolean().optional(),
    bookingHidePrice: z.boolean().optional(),
    bookingHideDuration: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict();

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

servicesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("services.read"),
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const filter = parseFilter(req);
    const activeEquals = (filter as { active?: { equals?: boolean } } | undefined)?.active?.equals;
    const first = req.query.first != null ? Math.min(Number(req.query.first), 200) : 100;
    const list = await listServicesForBusiness(bid, activeEquals, first);
    res.json({ records: list });
  })
);

servicesRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("services.read"),
  wrapAsync(async (req: Request, res: Response) => {
    const row = await getServiceForBusiness(req.params.id, businessId(req));
    if (!row) throw new NotFoundError("Service not found.");
    res.json(row);
  })
);

servicesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("services.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    const body = parsed.data;
    assertBookingDailyHoursValid(body.bookingDailyHours);
    if (body.business?._link && body.business._link !== bid) {
      throw new BadRequestError("Business mismatch.");
    }

    const resolvedCategory = await resolveCategoryAssignment(bid, body);
    const createdAt = new Date();
    const serviceId = randomUUID();
    let createdId: string | null = null;

    try {
      const [created] = await db
        .insert(services)
        .values({
          id: serviceId,
          businessId: bid,
          name: body.name,
          price: String(body.price),
          durationMinutes: body.durationMinutes ?? null,
          category: resolvedCategory.legacyCategory,
          categoryId: resolvedCategory.categoryId,
          sortOrder: body.sortOrder ?? 0,
          notes: encodeLegacyServiceNotes(body.notes ?? null, resolvedCategory.legacyCategory),
          taxable: body.taxable ?? true,
          isAddon: body.isAddon ?? false,
          bookingEnabled: body.bookingEnabled ?? false,
          bookingFlowType: body.bookingFlowType ?? "inherit",
          bookingDescription: body.bookingDescription?.trim() || null,
          bookingDepositAmount: String(body.bookingDepositAmount ?? 0),
          bookingLeadTimeHours: body.bookingLeadTimeHours ?? 0,
          bookingWindowDays: body.bookingWindowDays ?? 30,
          bookingRequestRequireExactTime: body.bookingRequestRequireExactTime ?? null,
          bookingRequestAllowTimeWindows: body.bookingRequestAllowTimeWindows ?? null,
          bookingRequestAllowFlexibility: body.bookingRequestAllowFlexibility ?? null,
          bookingRequestReviewMessage: body.bookingRequestReviewMessage?.trim() || null,
          bookingRequestAllowAlternateSlots: body.bookingRequestAllowAlternateSlots ?? null,
          bookingRequestAlternateSlotLimit:
            body.bookingRequestAlternateSlotLimit != null
              ? normalizeBookingRequestAlternateSlotLimit(body.bookingRequestAlternateSlotLimit)
              : null,
          bookingRequestAlternateOfferExpiryHours:
            body.bookingRequestAlternateOfferExpiryHours != null
              ? normalizeBookingRequestAlternateOfferExpiryHours(body.bookingRequestAlternateOfferExpiryHours)
              : null,
          bookingServiceMode: body.bookingServiceMode ?? "in_shop",
          bookingAvailableDays: body.bookingAvailableDays ? JSON.stringify(body.bookingAvailableDays) : null,
          bookingAvailableStartTime: body.bookingAvailableStartTime ?? null,
          bookingAvailableEndTime: body.bookingAvailableEndTime ?? null,
          bookingDailyHours: serializeBookingDailyHoursForStorage(body.bookingDailyHours),
          bookingCapacityPerSlot: body.bookingCapacityPerSlot ?? null,
          bookingFeatured: body.bookingFeatured ?? false,
          bookingHidePrice: body.bookingHidePrice ?? false,
          bookingHideDuration: body.bookingHideDuration ?? false,
            active: body.active ?? true,
            createdAt,
            updatedAt: createdAt,
        })
        .returning({ id: services.id });
      createdId = created?.id ?? null;
    } catch (error) {
      warnOnce("services:create:fallback", "service create falling back without full category schema", {
        businessId: bid,
        error: error instanceof Error ? error.message : String(error),
      });
      createdId = await insertLegacyServiceRecord(bid, serviceId, body, resolvedCategory);
    }

    if (!createdId) throw new BadRequestError("Unable to create service.");
    const created = await getServiceForBusiness(createdId, bid);
    if (!created) throw new NotFoundError("Service not found after create.");
    res.status(201).json(created);
  })
);

servicesRouter.patch(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("services.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const existing = await getServiceForBusiness(req.params.id, bid);
    if (!existing) throw new NotFoundError("Service not found.");

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    const body = parsed.data;
    assertBookingDailyHoursValid(body.bookingDailyHours);
    if (Object.keys(body).length === 0) {
      res.json(existing);
      return;
    }

    const resolvedCategory =
      body.category !== undefined || body.categoryId !== undefined
        ? await resolveCategoryAssignment(bid, {
            category: body.category ?? existing.category,
            categoryId: body.categoryId ?? existing.categoryId,
          })
        : {
            categoryId: existing.categoryId,
            legacyCategory: isLegacyServiceCategory(existing.category) ? existing.category : "other",
          };

    try {
      await db
        .update(services)
        .set({
          ...(body.name != null ? { name: body.name } : {}),
          ...(body.price != null ? { price: String(body.price) } : {}),
          ...(body.durationMinutes !== undefined ? { durationMinutes: body.durationMinutes } : {}),
          ...(body.category !== undefined || body.categoryId !== undefined
            ? { category: resolvedCategory.legacyCategory, categoryId: resolvedCategory.categoryId }
            : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          ...(body.notes !== undefined || body.category !== undefined || body.categoryId !== undefined
            ? {
                notes: encodeLegacyServiceNotes(
                  body.notes !== undefined ? body.notes : existing.notes,
                  resolvedCategory.legacyCategory
                ),
              }
            : {}),
          ...(body.taxable !== undefined ? { taxable: body.taxable } : {}),
          ...(body.isAddon !== undefined ? { isAddon: body.isAddon } : {}),
          ...(body.bookingEnabled !== undefined ? { bookingEnabled: body.bookingEnabled } : {}),
          ...(body.bookingFlowType !== undefined ? { bookingFlowType: body.bookingFlowType } : {}),
            ...(body.bookingDescription !== undefined
              ? { bookingDescription: body.bookingDescription?.trim() || null }
              : {}),
            ...(body.bookingDepositAmount !== undefined ? { bookingDepositAmount: String(body.bookingDepositAmount) } : {}),
            ...(body.bookingLeadTimeHours !== undefined ? { bookingLeadTimeHours: body.bookingLeadTimeHours } : {}),
            ...(body.bookingWindowDays !== undefined ? { bookingWindowDays: body.bookingWindowDays } : {}),
            ...(body.bookingRequestRequireExactTime !== undefined
              ? { bookingRequestRequireExactTime: body.bookingRequestRequireExactTime }
              : {}),
            ...(body.bookingRequestAllowTimeWindows !== undefined
              ? { bookingRequestAllowTimeWindows: body.bookingRequestAllowTimeWindows }
              : {}),
            ...(body.bookingRequestAllowFlexibility !== undefined
              ? { bookingRequestAllowFlexibility: body.bookingRequestAllowFlexibility }
              : {}),
            ...(body.bookingRequestReviewMessage !== undefined
              ? { bookingRequestReviewMessage: body.bookingRequestReviewMessage?.trim() || null }
              : {}),
            ...(body.bookingRequestAllowAlternateSlots !== undefined
              ? { bookingRequestAllowAlternateSlots: body.bookingRequestAllowAlternateSlots }
              : {}),
            ...(body.bookingRequestAlternateSlotLimit !== undefined
              ? {
                  bookingRequestAlternateSlotLimit:
                    body.bookingRequestAlternateSlotLimit != null
                      ? normalizeBookingRequestAlternateSlotLimit(body.bookingRequestAlternateSlotLimit)
                      : null,
                }
              : {}),
            ...(body.bookingRequestAlternateOfferExpiryHours !== undefined
              ? {
                  bookingRequestAlternateOfferExpiryHours:
                    body.bookingRequestAlternateOfferExpiryHours != null
                      ? normalizeBookingRequestAlternateOfferExpiryHours(body.bookingRequestAlternateOfferExpiryHours)
                      : null,
                }
              : {}),
            ...(body.bookingServiceMode !== undefined ? { bookingServiceMode: body.bookingServiceMode } : {}),
            ...(body.bookingAvailableDays !== undefined ? { bookingAvailableDays: JSON.stringify(body.bookingAvailableDays ?? []) } : {}),
            ...(body.bookingAvailableStartTime !== undefined ? { bookingAvailableStartTime: body.bookingAvailableStartTime ?? null } : {}),
            ...(body.bookingAvailableEndTime !== undefined ? { bookingAvailableEndTime: body.bookingAvailableEndTime ?? null } : {}),
            ...(body.bookingDailyHours !== undefined
              ? { bookingDailyHours: serializeBookingDailyHoursForStorage(body.bookingDailyHours) }
              : {}),
            ...(body.bookingCapacityPerSlot !== undefined ? { bookingCapacityPerSlot: body.bookingCapacityPerSlot ?? null } : {}),
            ...(body.bookingFeatured !== undefined ? { bookingFeatured: body.bookingFeatured } : {}),
            ...(body.bookingHidePrice !== undefined ? { bookingHidePrice: body.bookingHidePrice } : {}),
            ...(body.bookingHideDuration !== undefined ? { bookingHideDuration: body.bookingHideDuration } : {}),
            ...(body.active !== undefined ? { active: body.active } : {}),
          updatedAt: new Date(),
        })
        .where(eq(services.id, req.params.id));
    } catch (error) {
      if (!isServiceSchemaDriftError(error)) throw error;
      await updateLegacyServiceRecord(bid, req.params.id, body, existing, resolvedCategory);
    }

    const updated = await getServiceForBusiness(req.params.id, bid);
    if (!updated) throw new NotFoundError("Service not found after update.");
    res.json(updated);
  })
);

servicesRouter.post(
  "/reorder",
  requireAuth,
  requireTenant,
  requirePermission("services.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

    const existing = await db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.businessId, bid), inArray(services.id, parsed.data.orderedIds)));
    if (existing.length !== parsed.data.orderedIds.length) {
      throw new BadRequestError("Service reorder includes records outside this business.");
    }

    try {
      await Promise.all(
        parsed.data.orderedIds.map((id, index) =>
          db
            .update(services)
            .set({ sortOrder: index, updatedAt: new Date() })
            .where(and(eq(services.id, id), eq(services.businessId, bid)))
        )
      );
    } catch (error) {
      if (!isServiceSchemaDriftError(error)) throw error;
      const columns = await getServiceColumns();
      if (!columns.has("sort_order")) {
        throw new BadRequestError("Service ordering is not available until the latest database update is applied.");
      }
      await Promise.all(
        parsed.data.orderedIds.map((id, index) =>
          db.execute(sql`
            update "services"
            set "sort_order" = ${index}
            ${columns.has("updated_at") ? sql`, "updated_at" = ${new Date()}` : sql``}
            where "id" = ${id} and "business_id" = ${bid}
          `)
        )
      );
    }

    res.json({ ok: true });
  })
);

servicesRouter.delete(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("services.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const existing = await getServiceForBusiness(req.params.id, bid);
    if (!existing) throw new NotFoundError("Service not found.");

    const [usage] = await db
      .select({ c: count() })
      .from(appointmentServices)
      .where(eq(appointmentServices.serviceId, req.params.id));
    if (Number(usage?.c ?? 0) > 0) {
      throw new BadRequestError("This service is linked to past appointments. Deactivate it instead of deleting.");
    }

    await db.delete(services).where(and(eq(services.id, req.params.id), eq(services.businessId, bid)));
    res.status(204).end();
  })
);
