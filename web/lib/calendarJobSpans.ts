import { isCalendarBlockAppointment } from "@/lib/calendarBlocks";

export type CalendarJobLike = {
  id?: string;
  startTime: string;
  endTime?: string | null;
  jobStartTime?: string | null;
  expectedCompletionTime?: string | null;
  pickupReadyTime?: string | null;
  vehicleOnSite?: boolean | null;
  jobPhase?: string | null;
  status?: string | null;
  internalNotes?: string | null;
  client?: unknown | null;
};

function isInternalCalendarAppointment(appointment: CalendarJobLike): boolean {
  return isCalendarBlockAppointment(appointment) || appointment.client == null;
}

export type CalendarAgendaItem<T extends CalendarJobLike> = {
  appointment: T;
  kind: "booked" | "onsite";
};

export function dayStart(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function dayEnd(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function parseCalendarDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    !Number.isInteger(day) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export function parseCalendarDateTimeInput(dateValue: string, timeValue: string): Date | null {
  const baseDate = parseCalendarDateInput(dateValue);
  if (!baseDate) return null;

  const match = /^(\d{2}):(\d{2})$/.exec(timeValue.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  baseDate.setHours(hours, minutes, 0, 0);
  return baseDate;
}

export function getWorkStart(appointment: CalendarJobLike): Date {
  return new Date(appointment.startTime);
}

export function getWorkEnd(appointment: CalendarJobLike): Date {
  const start = getWorkStart(appointment);
  return appointment.endTime ? new Date(appointment.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
}

export function getJobSpanStart(appointment: CalendarJobLike): Date {
  return appointment.jobStartTime ? new Date(appointment.jobStartTime) : getWorkStart(appointment);
}

export function getJobSpanEnd(appointment: CalendarJobLike): Date {
  if (appointment.pickupReadyTime) return new Date(appointment.pickupReadyTime);
  if (appointment.expectedCompletionTime) return new Date(appointment.expectedCompletionTime);
  return getWorkEnd(appointment);
}

function getInclusiveRangeEnd(end: Date, start?: Date): Date {
  const normalized = new Date(end);
  const isExactMidnight =
    normalized.getHours() === 0 &&
    normalized.getMinutes() === 0 &&
    normalized.getSeconds() === 0 &&
    normalized.getMilliseconds() === 0;

  if (isExactMidnight && (!start || normalized.getTime() > start.getTime())) {
    normalized.setMilliseconds(normalized.getMilliseconds() - 1);
  }

  return normalized;
}

export function hasLaborOnDay(appointment: CalendarJobLike, date: Date): boolean {
  const start = getWorkStart(appointment).getTime();
  const end = getInclusiveRangeEnd(getWorkEnd(appointment), getWorkStart(appointment)).getTime();
  return start <= dayEnd(date).getTime() && end >= dayStart(date).getTime();
}

export function hasPresenceOnDay(appointment: CalendarJobLike, date: Date): boolean {
  const spanStart = getJobSpanStart(appointment);
  const start = spanStart.getTime();
  const end = getInclusiveRangeEnd(getJobSpanEnd(appointment), spanStart).getTime();
  return start <= dayEnd(date).getTime() && end >= dayStart(date).getTime();
}

export function isMultiDayJob(appointment: CalendarJobLike): boolean {
  const start = getJobSpanStart(appointment);
  const end = getJobSpanEnd(appointment);
  return (
    appointment.vehicleOnSite === true &&
    dayStart(start).getTime() !== dayStart(end).getTime()
  );
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return dayStart(left).getTime() === dayStart(right).getTime();
}

export type MultiDayDayKind =
  | "dropoff"
  | "active_work"
  | "waiting"
  | "curing"
  | "hold"
  | "pickup_ready"
  | "pickup";

export function getMultiDayDayKind(
  appointment: CalendarJobLike,
  date: Date,
): MultiDayDayKind | null {
  if (!isMultiDayJob(appointment) || !hasPresenceOnDay(appointment, date)) return null;

  const spanStart = getJobSpanStart(appointment);
  const spanEnd = getJobSpanEnd(appointment);
  const pickupReady = appointment.pickupReadyTime ? new Date(appointment.pickupReadyTime) : null;

  if (isSameCalendarDay(spanStart, date)) return "dropoff";
  if (isSameCalendarDay(spanEnd, date)) return "pickup";
  if (pickupReady && isSameCalendarDay(pickupReady, date)) return "pickup_ready";
  if (hasLaborOnDay(appointment, date)) return "active_work";

  switch (appointment.jobPhase) {
    case "waiting":
      return "waiting";
    case "curing":
      return "curing";
    case "hold":
      return "hold";
    case "pickup_ready":
      return "pickup_ready";
    default:
      return "waiting";
  }
}

export function isVisibleCalendarAppointment(appointment: CalendarJobLike): boolean {
  return true;
}

export function getActiveCalendarAppointments<T extends CalendarJobLike>(appointments: T[]): T[] {
  return appointments.filter(
    (appointment) =>
      appointment.status !== "cancelled" &&
      appointment.status !== "no-show" &&
      appointment.status !== "completed"
  );
}

export function getOverviewCalendarAppointments<T extends CalendarJobLike>(appointments: T[]): T[] {
  return appointments.filter(
    (appointment) => appointment.status !== "cancelled" && appointment.status !== "no-show"
  );
}

export function getVisibleCalendarAppointments<T extends CalendarJobLike>(appointments: T[]): T[] {
  return appointments.filter((appointment) => isVisibleCalendarAppointment(appointment));
}

export function getHistoricalCalendarAppointments<T extends CalendarJobLike>(appointments: T[]): T[] {
  return appointments.filter((appointment) => isVisibleCalendarAppointment(appointment));
}

export function getCalendarDaySnapshot<T extends CalendarJobLike & { id: string }>(appointments: T[], date: Date) {
  const visibleAppointments = getVisibleCalendarAppointments(appointments);
  const activeAppointments = getActiveCalendarAppointments(appointments);
  const dayAppts = visibleAppointments.filter((appointment) => hasLaborOnDay(appointment, date));
  const daySpans = visibleAppointments.filter((appointment) => isMultiDayJob(appointment) && hasPresenceOnDay(appointment, date));
  const bookedIds = new Set(dayAppts.map((appointment) => appointment.id));
  const onSiteOnlyJobs = daySpans.filter((appointment) => !bookedIds.has(appointment.id));
  const activeDayAppts = activeAppointments.filter((appointment) => hasLaborOnDay(appointment, date));
  const activeDaySpans = activeAppointments.filter((appointment) => isMultiDayJob(appointment) && hasPresenceOnDay(appointment, date));
  const activeBookedIds = new Set(activeDayAppts.map((appointment) => appointment.id));
  const activeOnSiteOnlyJobs = activeDaySpans.filter((appointment) => !activeBookedIds.has(appointment.id));
  const agendaItems: CalendarAgendaItem<T>[] = [
    ...dayAppts.map((appointment) => ({ appointment, kind: "booked" as const })),
    ...onSiteOnlyJobs.map((appointment) => ({ appointment, kind: "onsite" as const })),
  ].sort((a, b) => {
    const aTime = a.kind === "onsite" ? getJobSpanStart(a.appointment).getTime() : getWorkStart(a.appointment).getTime();
    const bTime = b.kind === "onsite" ? getJobSpanStart(b.appointment).getTime() : getWorkStart(b.appointment).getTime();
    return aTime - bTime;
  });

  return {
    activeAppointments,
    visibleAppointments,
    dayAppts,
    daySpans,
    onSiteOnlyJobs,
    agendaItems,
    activeItemCount: activeDayAppts.length + activeOnSiteOnlyJobs.length,
  };
}

export function getJobPhaseLabel(phase: string | null | undefined): string {
  switch (phase) {
    case "active_work":
      return "Active work";
    case "waiting":
      return "Waiting";
    case "curing":
      return "Curing";
    case "hold":
      return "Hold";
    case "pickup_ready":
      return "Pickup ready";
    default:
      return "Scheduled";
  }
}

export function getJobPhaseTone(phase: string | null | undefined): string {
  switch (phase) {
    case "active_work":
      return "bg-violet-500";
    case "waiting":
      return "bg-slate-500";
    case "curing":
      return "bg-emerald-500";
    case "hold":
      return "bg-rose-500";
    case "pickup_ready":
      return "bg-sky-500";
    default:
      return "bg-amber-500";
  }
}

export function getMultiDayDayLabel(kind: MultiDayDayKind | null): string {
  switch (kind) {
    case "dropoff":
      return "Drop-off";
    case "active_work":
      return "Active work";
    case "waiting":
      return "Waiting";
    case "curing":
      return "Curing";
    case "hold":
      return "On hold";
    case "pickup_ready":
      return "Pickup ready";
    case "pickup":
      return "Pickup";
    default:
      return "On site";
  }
}

export function getMultiDayDayShortLabel(kind: MultiDayDayKind | null): string {
  switch (kind) {
    case "dropoff":
      return "Drop";
    case "active_work":
      return "Work";
    case "waiting":
      return "Wait";
    case "curing":
      return "Cure";
    case "hold":
      return "Hold";
    case "pickup_ready":
      return "Ready";
    case "pickup":
      return "Pickup";
    default:
      return "On site";
  }
}

export function getMultiDayDayTone(kind: MultiDayDayKind | null): string {
  switch (kind) {
    case "dropoff":
      return "bg-amber-500";
    case "active_work":
      return "bg-violet-500";
    case "waiting":
      return "bg-slate-500";
    case "curing":
      return "bg-emerald-500";
    case "hold":
      return "bg-rose-500";
    case "pickup_ready":
      return "bg-sky-500";
    case "pickup":
      return "bg-cyan-600";
    default:
      return "bg-slate-500";
  }
}

function formatShortDateTime(value: Date): string {
  return value.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function getOperationalDayLabel(appointment: CalendarJobLike, date: Date): string {
  const multiDayKind = getMultiDayDayKind(appointment, date);
  if (multiDayKind) return getMultiDayDayLabel(multiDayKind);

  switch (appointment.status) {
    case "in_progress":
      return "Active work";
    case "completed":
      return "Completed";
    case "confirmed":
      return "Confirmed";
    case "cancelled":
      return "Cancelled";
    case "no-show":
      return "No show";
    default:
      return "Scheduled";
  }
}

export function getOperationalTimelineLabel(appointment: CalendarJobLike): string {
  if (isMultiDayJob(appointment) || appointment.vehicleOnSite) {
    return `${formatShortDateTime(getJobSpanStart(appointment))} - ${formatShortDateTime(getJobSpanEnd(appointment))}`;
  }

  const workStart = getWorkStart(appointment);
  const workEnd = getWorkEnd(appointment);
  if (isSameCalendarDay(workStart, workEnd)) {
    return `${formatShortDate(workStart)} · ${workStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} - ${workEnd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }

  return `${formatShortDateTime(workStart)} - ${formatShortDateTime(workEnd)}`;
}
