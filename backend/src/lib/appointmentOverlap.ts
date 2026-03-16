/**
 * Double-booking prevention: staff-level and business-level.
 * Overlap: start1 < end2 && start2 < end1. Cancelled and no-show are excluded.
 */

import { db } from "../db/index.js";
import { appointments } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

const DEFAULT_DURATION_MINUTES = 60;

function resolveEndTime(start: Date, end: Date | null): Date {
  if (end && end.getTime() > start.getTime()) return end;
  const e = new Date(start);
  e.setMinutes(e.getMinutes() + DEFAULT_DURATION_MINUTES);
  return e;
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

  const excludeClause = params.excludeAppointmentId
    ? sql`AND ${appointments.id} != ${params.excludeAppointmentId}`
    : sql``;
  const staffClause = params.assignedStaffId
    ? sql`AND ${appointments.assignedStaffId} = ${params.assignedStaffId}`
    : sql``;

  const rows = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      sql`${appointments.businessId} = ${params.businessId}
        AND ${appointments.status} NOT IN ('cancelled', 'no-show')
        AND (${appointments.startTime} < ${end})
        AND (COALESCE(${appointments.endTime}, ${appointments.startTime} + interval '1 hour') > ${start})
        ${excludeClause}
        ${staffClause}`
    )
    .limit(1);

  return rows.length > 0;
}
