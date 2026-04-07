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
