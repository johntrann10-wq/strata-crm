export type CalendarJobLike = {
  startTime: string;
  endTime?: string | null;
  jobStartTime?: string | null;
  expectedCompletionTime?: string | null;
  pickupReadyTime?: string | null;
  vehicleOnSite?: boolean | null;
  jobPhase?: string | null;
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

export function hasLaborOnDay(appointment: CalendarJobLike, date: Date): boolean {
  const start = getWorkStart(appointment).getTime();
  const end = getWorkEnd(appointment).getTime();
  return start <= dayEnd(date).getTime() && end >= dayStart(date).getTime();
}

export function hasPresenceOnDay(appointment: CalendarJobLike, date: Date): boolean {
  const start = getJobSpanStart(appointment).getTime();
  const end = getJobSpanEnd(appointment).getTime();
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
