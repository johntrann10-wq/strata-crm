/**
 * Double-booking prevention: staff-level and business-level.
 * Overlap: start1 < end2 && start2 < end1. Cancelled and no-show are excluded.
 */

import { db } from "../db/index.js";
import { appointments } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

const DEFAULT_DURATION_MINUTES = 60;
let cachedAppointmentColumns: Set<string> | null = null;

function resolveEndTime(start: Date, end: Date | null): Date {
  if (end && end.getTime() > start.getTime()) return end;
  const e = new Date(start);
  e.setMinutes(e.getMinutes() + DEFAULT_DURATION_MINUTES);
  return e;
}

function isAppointmentSchemaDriftError(error: unknown): boolean {
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

async function getAppointmentColumns(): Promise<Set<string>> {
  if (cachedAppointmentColumns) return cachedAppointmentColumns;
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments'
  `);
  const resultWithRows = result as unknown as { rows?: Array<{ column_name?: string }> };
  const rows = Array.isArray(resultWithRows.rows) ? resultWithRows.rows : [];
  cachedAppointmentColumns = new Set(
    rows
      .map((row) => row?.column_name)
      .filter((value): value is string => typeof value === "string")
  );
  return cachedAppointmentColumns;
}

/**
 * Returns true if there is an overlapping appointment.
 * Business-level: any appointment in the business overlapping.
 * When assignedStaffId is set, only same-staff overlaps count (staff-level).
 * Excludes cancelled and no-show. excludeAppointmentId for updates.
 */
export async function hasAppointmentOverlap(params: {
  businessId: string;
  startTime: Date;
  endTime: Date | null;
  assignedStaffId?: string | null;
  excludeAppointmentId?: string | null;
}): Promise<boolean> {
  const end = resolveEndTime(params.startTime, params.endTime);
  const start = params.startTime;
  const runFullOverlapQuery = async () =>
    db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        sql`${appointments.businessId} = ${params.businessId}
          AND ${appointments.status} NOT IN ('cancelled', 'no-show')
          AND (${appointments.startTime} < ${end})
          AND (COALESCE(${appointments.endTime}, ${appointments.startTime} + interval '1 hour') > ${start})
          ${
            params.excludeAppointmentId
              ? sql`AND ${appointments.id} != ${params.excludeAppointmentId}`
              : sql``
          }
          ${
            params.assignedStaffId
              ? sql`AND ${appointments.assignedStaffId} = ${params.assignedStaffId}`
              : sql``
          }`
      )
      .limit(1);

  try {
    const rows = await runFullOverlapQuery();
    return rows.length > 0;
  } catch (error) {
    if (!isAppointmentSchemaDriftError(error)) throw error;

    const columns = await getAppointmentColumns();
    if (!columns.has("business_id") || !columns.has("start_time")) {
      logger.warn("Appointment overlap check skipped: legacy schema missing required columns", {
        businessId: params.businessId,
      });
      return false;
    }

    const conditions = [sql`${appointments.businessId} = ${params.businessId}`];
    if (columns.has("status")) {
      conditions.push(sql`${appointments.status} NOT IN ('cancelled', 'no-show')`);
    }
    conditions.push(sql`${appointments.startTime} < ${end}`);
    if (columns.has("end_time")) {
      conditions.push(
        sql`(COALESCE(${appointments.endTime}, ${appointments.startTime} + interval '1 hour') > ${start})`
      );
    } else {
      conditions.push(sql`(${appointments.startTime} + interval '1 hour' > ${start})`);
    }
    if (params.excludeAppointmentId && columns.has("id")) {
      conditions.push(sql`${appointments.id} != ${params.excludeAppointmentId}`);
    }
    if (params.assignedStaffId && columns.has("assigned_staff_id")) {
      conditions.push(sql`${appointments.assignedStaffId} = ${params.assignedStaffId}`);
    }

    logger.warn("Appointment overlap check falling back for legacy schema", {
      businessId: params.businessId,
      assignedStaffId: params.assignedStaffId ?? null,
    });

    const rows = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(sql.join(conditions, sql` AND `))
      .limit(1);

    return rows.length > 0;
  }
}

export async function countOverlappingAppointments(params: {
  businessId: string;
  startTime: Date;
  endTime: Date | null;
  assignedStaffId?: string | null;
  excludeAppointmentId?: string | null;
}): Promise<number> {
  const end = resolveEndTime(params.startTime, params.endTime);
  const start = params.startTime;

  const runCountQuery = async () =>
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(appointments)
      .where(
        sql`${appointments.businessId} = ${params.businessId}
          AND ${appointments.status} NOT IN ('cancelled', 'no-show')
          AND (${appointments.startTime} < ${end})
          AND (COALESCE(${appointments.endTime}, ${appointments.startTime} + interval '1 hour') > ${start})
          ${
            params.excludeAppointmentId
              ? sql`AND ${appointments.id} != ${params.excludeAppointmentId}`
              : sql``
          }
          ${
            params.assignedStaffId
              ? sql`AND ${appointments.assignedStaffId} = ${params.assignedStaffId}`
              : sql``
          }`
      );

  try {
    const rows = await runCountQuery();
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    if (!isAppointmentSchemaDriftError(error)) throw error;

    const columns = await getAppointmentColumns();
    if (!columns.has("business_id") || !columns.has("start_time")) {
      logger.warn("Appointment overlap count skipped: legacy schema missing required columns", {
        businessId: params.businessId,
      });
      return 0;
    }

    const conditions = [sql`${appointments.businessId} = ${params.businessId}`];
    if (columns.has("status")) {
      conditions.push(sql`${appointments.status} NOT IN ('cancelled', 'no-show')`);
    }
    conditions.push(sql`${appointments.startTime} < ${end}`);
    if (columns.has("end_time")) {
      conditions.push(
        sql`(COALESCE(${appointments.endTime}, ${appointments.startTime} + interval '1 hour') > ${start})`
      );
    } else {
      conditions.push(sql`(${appointments.startTime} + interval '1 hour' > ${start})`);
    }
    if (params.excludeAppointmentId && columns.has("id")) {
      conditions.push(sql`${appointments.id} != ${params.excludeAppointmentId}`);
    }
    if (params.assignedStaffId && columns.has("assigned_staff_id")) {
      conditions.push(sql`${appointments.assignedStaffId} = ${params.assignedStaffId}`);
    }

    logger.warn("Appointment overlap count falling back for legacy schema", {
      businessId: params.businessId,
      assignedStaffId: params.assignedStaffId ?? null,
    });

    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(appointments)
      .where(sql.join(conditions, sql` AND `));

    return Number(rows[0]?.count ?? 0);
  }
}
