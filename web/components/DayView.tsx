import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getCalendarBlockLabel, isCalendarBlockAppointment, isFullDayCalendarBlock } from "@/lib/calendarBlocks";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Plus } from "lucide-react";
import {
  getCalendarDaySnapshot,
  getJobSpanEnd,
  getMultiDayDayKind,
  getMultiDayDayLabel,
  getMultiDayDayTone,
  isMultiDayJob,
} from "@/lib/calendarJobSpans";
import {
  START_HOUR,
  END_HOUR,
  HOUR_HEIGHT,
  TOTAL_HEIGHT,
  TIME_HOURS,
  isSameDay,
  formatHour,
  formatTime,
  buildSlotDate,
  clampSlotMinutes,
  getStatusStyle,
  apptLabel,
  apptClientLabel,
  apptMoneyLabel,
  apptStageLabel,
  apptVehicleLabel,
  type ApptRecord,
  AppointmentBlock,
  activeDragDurationMs,
} from "./CalendarViews";

interface DayViewProps {
  currentDate: Date;
  appointments: ApptRecord[];
  onSlotClick: (date: Date) => void;
  onApptClick: (apt: ApptRecord) => void;
  selectedAppointmentId?: string | null;
  isMobileLayout: boolean;
  onReschedule?: (appointmentId: string, newStart: Date, newEnd: Date | null) => void;
  conflictIds?: Set<string>;
}

function DaySection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-border/70 bg-white/80 p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
        <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function MobileAgendaSectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <span className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

export function DayView({
  currentDate,
  appointments,
  onSlotClick,
  onApptClick,
  selectedAppointmentId,
  isMobileLayout,
  onReschedule,
  conflictIds,
}: DayViewProps) {
  const [dragOverMinute, setDragOverMinute] = useState<number | null>(null);

  const daySnapshot = useMemo(() => getCalendarDaySnapshot(appointments, currentDate), [appointments, currentDate]);
  const dayAppts = daySnapshot.dayAppts;
  const agendaItems = daySnapshot.agendaItems;
  const onSiteOnlyJobs = daySnapshot.onSiteOnlyJobs;
  const visibleItemCount = agendaItems.length;
  const timedAgendaItems = useMemo(() => agendaItems.filter((item) => item.kind !== "onsite"), [agendaItems]);
  const onSiteAgendaItems = useMemo(() => agendaItems.filter((item) => item.kind === "onsite"), [agendaItems]);
  const positionedAppointments = useMemo(() => {
    type Positioned = {
      appointment: ApptRecord;
      leftCss: string;
      widthCss: string;
      zIndex: number;
    };

    const timedAppointments = dayAppts.filter((apt) => !isCalendarBlockAppointment(apt));
    const calendarBlocks = dayAppts.filter((apt) => isCalendarBlockAppointment(apt));
    const sorted = [...timedAppointments].sort((a, b) => {
      const startDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      if (startDiff !== 0) return startDiff;
      const aEnd = a.endTime ? new Date(a.endTime).getTime() : new Date(a.startTime).getTime() + 3600000;
      const bEnd = b.endTime ? new Date(b.endTime).getTime() : new Date(b.startTime).getTime() + 3600000;
      return aEnd - bEnd;
    });

    const gutter = 6;
    const horizontalInset = 6;
    const positioned: Positioned[] = [];

    let index = 0;
    while (index < sorted.length) {
      const cluster: ApptRecord[] = [];
      let clusterEnd = 0;

      while (index < sorted.length) {
        const appointment = sorted[index];
        const startMs = new Date(appointment.startTime).getTime();
        const endMs = appointment.endTime
          ? new Date(appointment.endTime).getTime()
          : startMs + 3600000;

        if (cluster.length === 0 || startMs < clusterEnd) {
          cluster.push(appointment);
          clusterEnd = Math.max(clusterEnd, endMs);
          index += 1;
          continue;
        }
        break;
      }

      const lanes: Array<Array<{ startMs: number; endMs: number }>> = [];
      const laneAssignments = new Map<string, number>();
      for (const appointment of cluster) {
        const startMs = new Date(appointment.startTime).getTime();
        const endMs = appointment.endTime
          ? new Date(appointment.endTime).getTime()
          : startMs + 3600000;

        let laneIndex = lanes.findIndex((lane) => lane[lane.length - 1]!.endMs <= startMs);
        if (laneIndex === -1) {
          laneIndex = lanes.length;
          lanes.push([]);
        }
        lanes[laneIndex]!.push({ startMs, endMs });
        laneAssignments.set(appointment.id, laneIndex);
      }

      const maxColumns = Math.max(lanes.length, 1);
      const widthCss = `calc((100% - ${horizontalInset * 2}px - ${(maxColumns - 1) * gutter}px) / ${maxColumns})`;

      for (const appointment of cluster) {
        const laneIndex = laneAssignments.get(appointment.id) ?? 0;
        positioned.push({
          appointment,
          leftCss: `calc(${horizontalInset}px + (${laneIndex} * (${widthCss} + ${gutter}px)))`,
          widthCss,
          zIndex: 20 + laneIndex,
        });
      }
    }

    return {
      timed: positioned,
      blocks: calendarBlocks,
    };
  }, [dayAppts]);

  const today = useMemo(() => new Date(), []);
  const isToday = isSameDay(currentDate, today);
  const unassignedCount = dayAppts.filter((apt) => !isCalendarBlockAppointment(apt) && !apt.assignedStaffId).length;
  const activeItemCount = daySnapshot.activeItemCount;
  const nowLineTop = useMemo(() => {
    if (!isToday) return null;
    const currentDecimal = today.getHours() + today.getMinutes() / 60;
    if (currentDecimal < START_HOUR || currentDecimal > END_HOUR) return null;
    return (currentDecimal - START_HOUR) * HOUR_HEIGHT;
  }, [isToday, today]);

  useEffect(() => {
    if (isMobileLayout) return;
    const container = document.getElementById("day-scroll-container");
    if (!container) return;
    const now = new Date();
    const currentMinutes = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
    const scrollTop = (currentMinutes / 60) * HOUR_HEIGHT - 140;
    container.scrollTop = Math.max(0, scrollTop);
  }, [isMobileLayout]);

  if (isMobileLayout) {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background/95 shadow-sm">
        <div className="border-b border-border/70 bg-white/80 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {currentDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {timedAgendaItems.length} timed
                {onSiteAgendaItems.length > 0 ? ` · ${onSiteAgendaItems.length} in shop` : ""}
                {unassignedCount > 0 ? ` · ${unassignedCount} unassigned` : ""}
              </p>
            </div>
            <Button size="sm" className="h-8 rounded-full px-3" onClick={() => onSlotClick(currentDate)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5">
          {visibleItemCount === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-5 text-center">
              <CalendarIcon className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold text-foreground">Nothing on calendar yet</p>
              </div>
              <Button className="h-9 rounded-full px-4" onClick={() => onSlotClick(currentDate)}>
                <Plus className="mr-2 h-4 w-4" />
                New appointment
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {timedAgendaItems.length > 0 ? <MobileAgendaSectionLabel title="Timed work" count={timedAgendaItems.length} /> : null}
              {agendaItems.map(({ appointment, kind }) => {
                const style = getStatusStyle(appointment.status);
                const isBlock = isCalendarBlockAppointment(appointment);
                const multiDayKind = isMultiDayJob(appointment) ? getMultiDayDayKind(appointment, currentDate) : null;
                const moneyLabel = apptMoneyLabel(appointment);
                return (
                  <button
                    key={`${appointment.id}-${kind}-mobile`}
                    type="button"
                    className={cn(
                      "w-full rounded-2xl border bg-white px-3 py-2.5 text-left shadow-sm transition-all hover:shadow-md",
                      isBlock ? "border-slate-300/90 bg-slate-100/95 text-slate-800" : style.surface,
                      isBlock ? "" : style.text,
                      isBlock ? "" : style.border,
                      selectedAppointmentId === appointment.id && !isBlock && "ring-2 ring-primary/40",
                      conflictIds?.has(appointment.id) && "ring-1 ring-rose-300"
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      onApptClick(appointment);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {[isBlock ? getCalendarBlockLabel(appointment) : apptLabel(appointment), moneyLabel].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          {apptClientLabel(appointment)} · {apptVehicleLabel(appointment)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                          isBlock ? "bg-slate-200 text-slate-700" : style.pill
                        )}
                      >
                        {kind === "onsite"
                          ? getMultiDayDayLabel(multiDayKind)
                          : multiDayKind
                            ? getMultiDayDayLabel(multiDayKind)
                            : isBlock
                              ? (isFullDayCalendarBlock(appointment) ? "All day" : "Blocked")
                              : apptStageLabel(appointment, currentDate)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {kind === "onsite"
                          ? `${getMultiDayDayLabel(multiDayKind)} · until ${getJobSpanEnd(appointment).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                          : `${formatTime(new Date(appointment.startTime))}${appointment.endTime ? ` - ${formatTime(new Date(appointment.endTime))}` : ""}`}
                      </span>
                      {moneyLabel ? <span className="font-semibold text-foreground">{moneyLabel}</span> : null}
                      <span>
                        {kind === "onsite"
                          ? "Vehicle on site"
                          : appointment.assignedStaff
                            ? `${appointment.assignedStaff.firstName} ${appointment.assignedStaff.lastName}`
                            : "Unassigned"}
                      </span>
                      {appointment.isMobile ? <span>Mobile</span> : null}
                      {conflictIds?.has(appointment.id) ? <span className="font-semibold text-rose-700">Conflict</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const container = document.getElementById("day-scroll-container");
    const scrollTop = container?.scrollTop ?? 0;
    const y = e.clientY - rect.top + scrollTop;
    onSlotClick(buildSlotDate(currentDate, (y / HOUR_HEIGHT) * 60));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const container = document.getElementById("day-scroll-container");
    const scrollTop = container?.scrollTop ?? 0;
    const y = e.clientY - rect.top + scrollTop;
    setDragOverMinute(clampSlotMinutes((y / HOUR_HEIGHT) * 60));
  };

  const handleDragLeave = () => {
    setDragOverMinute(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData("appointmentId");
    const origStartTime = e.dataTransfer.getData("origStartTime");
    const origEndTime = e.dataTransfer.getData("origEndTime");

    if (!appointmentId || dragOverMinute === null) {
      setDragOverMinute(null);
      return;
    }

    const newStart = buildSlotDate(currentDate, dragOverMinute);

    let newEnd: Date | null = null;
    if (origStartTime && origEndTime) {
      const origStart = new Date(origStartTime);
      const origEnd = new Date(origEndTime);
      const duration = origEnd.getTime() - origStart.getTime();
      newEnd = new Date(newStart.getTime() + duration);
    }

    setDragOverMinute(null);
    onReschedule?.(appointmentId, newStart, newEnd);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background/95 shadow-sm">
      <div className="border-b border-border/70 bg-white/80 px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {currentDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          <p className="text-xs text-muted-foreground">
            {visibleItemCount} {visibleItemCount === 1 ? "item" : "items"} on calendar
            {activeItemCount !== visibleItemCount ? ` - ${activeItemCount} active` : ""}
            {unassignedCount > 0 ? ` - ${unassignedCount} unassigned` : ""}
          </p>
        </div>
          <Button size="sm" onClick={() => onSlotClick(currentDate)}>
            <Plus className="mr-2 h-4 w-4" />
            New appointment
          </Button>
        </div>
        {dayAppts.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
            <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
              {timedAgendaItems.length} timed
            </span>
            {onSiteAgendaItems.length > 0 ? (
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                {onSiteAgendaItems.length} in shop
              </span>
            ) : null}
            {unassignedCount > 0 ? (
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                {unassignedCount} unassigned
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div id="day-scroll-container" className="flex-1 overflow-y-auto">
        {onSiteOnlyJobs.length > 0 ? (
          <div className="border-b border-border/60 bg-muted/10 px-4 py-3">
            <DaySection title="In Shop Today" count={onSiteOnlyJobs.length}>
              <div className="space-y-2">
              {onSiteOnlyJobs.map((apt) => {
                const multiDayKind = getMultiDayDayKind(apt, currentDate);
                const moneyLabel = apptMoneyLabel(apt);
                return (
                <button
                  key={`${apt.id}-onsite`}
                  type="button"
                  onClick={() => onApptClick(apt)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-background/85 px-3 py-3 text-left",
                    selectedAppointmentId === apt.id && "border-primary/35 bg-primary/[0.05] ring-2 ring-primary/30"
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", getMultiDayDayTone(multiDayKind))} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{apptLabel(apt)}</p>
                    <p className="truncate text-xs text-muted-foreground">{apptClientLabel(apt)}</p>
                    <p className="truncate text-xs text-muted-foreground">{apptVehicleLabel(apt)}</p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {getJobSpanEnd(apt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) === currentDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        ? `Leaves today · ${getMultiDayDayLabel(multiDayKind)}`
                        : `${new Date(apt.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })} drop-off → ${getJobSpanEnd(apt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} pickup`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {moneyLabel ? <p className="text-[11px] font-semibold text-foreground">{moneyLabel}</p> : null}
                    <p className="text-[11px] font-semibold text-muted-foreground">{getMultiDayDayLabel(multiDayKind)}</p>
                  </div>
                </button>
                );
              })}
              </div>
            </DaySection>
          </div>
        ) : null}

        <div className="border-b border-border/60 bg-background/90 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Timed Work</p>
            <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {positionedAppointments.timed.length + positionedAppointments.blocks.length}
            </span>
          </div>
        </div>

        <div
          className="grid grid-cols-[72px_1fr] relative"
          style={{ height: TOTAL_HEIGHT }}
        >
          <div className="relative border-r border-border/60 bg-muted/15">
            {TIME_HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute inset-x-0 border-b border-border/40 px-3"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className="relative -top-3 text-[11px] font-medium text-muted-foreground select-none">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          <div
            className="relative cursor-pointer bg-background"
            style={{ height: TOTAL_HEIGHT }}
            onClick={handleColumnClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {TIME_HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-border/35 pointer-events-none"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              />
            ))}

            {Array.from({ length: END_HOUR - START_HOUR }).map((_, index) => (
              <div
                key={`half-${index}`}
                className="absolute inset-x-0 border-t border-dashed border-border/20 pointer-events-none"
                style={{ top: index * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
              />
            ))}

            {dragOverMinute !== null ? (
              <div
                className="absolute inset-x-2 rounded-xl border border-primary/35 bg-primary/12 pointer-events-none"
                style={{
                  top: (dragOverMinute / 60) * HOUR_HEIGHT,
                  height: Math.max((activeDragDurationMs / 3600000) * HOUR_HEIGHT, 42),
                }}
              />
            ) : null}

            {nowLineTop != null ? (
              <div
                className="absolute inset-x-0 z-10 pointer-events-none"
                style={{ top: nowLineTop }}
              >
                <div className="flex items-center gap-2">
                  <span className="ml-2 h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm" />
                  <div className="h-px flex-1 bg-rose-400/80" />
                </div>
              </div>
            ) : null}

            {positionedAppointments.blocks.map((apt) => (
              <AppointmentBlock
                key={apt.id}
                apt={apt}
                dayContext={currentDate}
                onClick={(event) => {
                  event.stopPropagation();
                  onApptClick(apt);
                }}
                isSelected={selectedAppointmentId === apt.id}
                isConflict={conflictIds?.has(apt.id)}
                zIndex={10}
              />
            ))}

            {positionedAppointments.timed.map(({ appointment, leftCss, widthCss, zIndex }) => (
              <AppointmentBlock
                key={appointment.id}
                apt={appointment}
                onClick={(event) => {
                  event.stopPropagation();
                  onApptClick(appointment);
                }}
                isSelected={selectedAppointmentId === appointment.id}
                isConflict={conflictIds?.has(appointment.id)}
                leftCss={leftCss}
                widthCss={widthCss}
                zIndex={zIndex}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
