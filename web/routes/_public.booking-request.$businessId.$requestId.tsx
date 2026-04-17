import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  ArrowRight,
  CalendarDays,
  CarFront,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  MailCheck,
  MessageSquareMore,
  Sparkles,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { API_BASE } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type BookingRequestStatus =
  | "submitted_request"
  | "under_review"
  | "approved_requested_slot"
  | "awaiting_customer_selection"
  | "confirmed"
  | "declined"
  | "customer_requested_new_time"
  | "expired";

type OwnerReviewStatus =
  | "pending"
  | "approved_requested_slot"
  | "proposed_alternates"
  | "requested_new_time"
  | "declined";

type Flexibility = "exact_time_only" | "same_day_flexible" | "any_nearby_slot";

type AlternateSlot = {
  id: string;
  startTime: string;
  endTime: string | null;
  label: string;
  expiresAt: string | null;
};

type PublicBookingRequestRecord = {
  id: string;
  businessId: string;
  businessName: string | null;
  status: BookingRequestStatus;
  ownerReviewStatus: OwnerReviewStatus;
  customerResponseStatus: string;
  serviceSummary: string;
  requestedDate: string | null;
  requestedTimeStart: string | null;
  requestedTimeEnd: string | null;
  requestedTimeLabel: string | null;
  requestedTimingSummary: string | null;
  customerTimezone: string;
  flexibility: Flexibility;
  ownerResponseMessage: string | null;
  alternateSlotOptions: AlternateSlot[];
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
    summary: string | null;
  };
  serviceAddress: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  serviceZip: string | null;
  notes: string | null;
  serviceMode: "in_shop" | "mobile";
  submittedAt: string;
  expiresAt: string | null;
  canRespond: boolean;
  requestPolicy: {
    requireExactTime: boolean;
    allowTimeWindows: boolean;
    allowFlexibility: boolean;
    reviewMessage: string | null;
    allowAlternateSlots: boolean;
    alternateSlotLimit: number;
    alternateOfferExpiryHours: number | null;
  };
  experienceCopy: {
    ownerResponsePage: string | null;
    alternateAcceptance: string | null;
    chooseAnotherDay: string | null;
  };
};

type PublicBookingRequestResponse = {
  record: PublicBookingRequestRecord;
  confirmationUrl: string | null;
  portalUrl: string | null;
  scheduledFor: string | null;
};

type PublicBookingRequestActionResponse = {
  ok: true;
  record: PublicBookingRequestRecord;
  appointmentId?: string;
  confirmationUrl?: string | null;
  portalUrl?: string | null;
  scheduledFor?: string | null;
};

type TimeMode = "exact" | "window";

const FLEXIBILITY_OPTIONS: Array<{ value: Flexibility; label: string }> = [
  { value: "exact_time_only", label: "Exact time only" },
  { value: "same_day_flexible", label: "Same day flexible" },
  { value: "any_nearby_slot", label: "Any nearby slot" },
];

const WINDOW_OPTIONS = ["Morning", "Midday", "After 3 PM", "Evening"];

function formatDateTime(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone || undefined,
  }).format(parsed);
}

function formatDateLabel(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "Choose a date";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timeZone || undefined,
  }).format(parsed);
}

function statusLabel(value: string): string {
  switch (value) {
    case "awaiting_customer_selection":
      return "Choose a time";
    case "customer_requested_new_time":
      return "Waiting on the shop";
    case "confirmed":
      return "Confirmed";
    case "declined":
      return "Closed";
    case "expired":
      return "Expired";
    default:
      return "Under review";
  }
}

function statusBadge(status: BookingRequestStatus): string {
  switch (status) {
    case "confirmed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "awaiting_customer_selection":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "declined":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "expired":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-800";
  }
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function combineDateAndTime(dateKey: string, time: string): string {
  return new Date(`${dateKey}T${time}:00`).toISOString();
}

function flexibilityLabel(value: Flexibility): string {
  switch (value) {
    case "exact_time_only":
      return "Exact time only";
    case "any_nearby_slot":
      return "Any nearby slot";
    default:
      return "Same day flexible";
  }
}

function buildServiceLocation(record: PublicBookingRequestRecord): string | null {
  const parts = [record.serviceAddress, record.serviceCity, record.serviceState, record.serviceZip].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function meta() {
  return [
    { title: "Booking request | Strata" },
    { name: "description", content: "Review alternate times or send another preferred booking time without starting over." },
  ];
}

export default function PublicBookingRequestRoute() {
  const { businessId, requestId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [payload, setPayload] = useState<PublicBookingRequestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"alternate" | "request" | "decline" | null>(null);
  const [timingMode, setTimingMode] = useState<TimeMode>("exact");
  const [requestDate, setRequestDate] = useState<Date | null>(null);
  const [exactTime, setExactTime] = useState("09:00");
  const [timeWindow, setTimeWindow] = useState("Morning");
  const [flexibility, setFlexibility] = useState<Flexibility>("same_day_flexible");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!businessId || !requestId || !token) {
      setLoading(false);
      setError("This booking request link is invalid.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/businesses/${encodeURIComponent(businessId)}/public-booking-requests/${encodeURIComponent(requestId)}?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const nextPayload = (await response.json().catch(() => ({}))) as PublicBookingRequestResponse & { message?: string };
        if (!response.ok) throw new Error(nextPayload.message || "This booking request is unavailable.");
        return nextPayload;
      })
      .then((nextPayload) => {
        if (cancelled) return;
        setPayload(nextPayload);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : "This booking request is unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, requestId, token]);

  useEffect(() => {
    if (!payload?.record) return;
    setRequestDate(parseDateKey(payload.record.requestedDate));
    setFlexibility(payload.record.requestPolicy?.allowFlexibility ? payload.record.flexibility : "same_day_flexible");
    if (payload.record.requestPolicy?.requireExactTime || payload.record.requestPolicy?.allowTimeWindows === false) {
      setTimingMode("exact");
      if (payload.record.requestedTimeStart) {
        const parsed = new Date(payload.record.requestedTimeStart);
        if (!Number.isNaN(parsed.getTime())) {
          setExactTime(`${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`);
        }
      }
      return;
    }
    if (payload.record.requestedTimeLabel) {
      setTimingMode("window");
      setTimeWindow(payload.record.requestedTimeLabel);
    } else {
      setTimingMode("exact");
      if (payload.record.requestedTimeStart) {
        const parsed = new Date(payload.record.requestedTimeStart);
        if (!Number.isNaN(parsed.getTime())) {
          setExactTime(`${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`);
        }
      }
    }
  }, [payload]);

  const record = payload?.record ?? null;
  const requestPolicy = record?.requestPolicy ?? {
    requireExactTime: false,
    allowTimeWindows: true,
    allowFlexibility: true,
    reviewMessage: null,
    allowAlternateSlots: true,
    alternateSlotLimit: 3,
    alternateOfferExpiryHours: null,
  };
  const experienceCopy = record?.experienceCopy ?? {
    ownerResponsePage: null,
    alternateAcceptance: null,
    chooseAnotherDay: null,
  };
  const requestAllowsWindowMode = Boolean(record) && !requestPolicy.requireExactTime && requestPolicy.allowTimeWindows;
  const browserTimezone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles" : "America/Los_Angeles";

  const submitResponse = async (body: Record<string, unknown>, mode: "alternate" | "request" | "decline") => {
    if (!businessId || !requestId || !token) return;
    setSubmitting(mode);
    try {
      const response = await fetch(
        `${API_BASE}/api/businesses/${encodeURIComponent(businessId)}/public-booking-requests/${encodeURIComponent(requestId)}/respond?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );
      const nextPayload = (await response.json().catch(() => ({}))) as PublicBookingRequestActionResponse & { message?: string };
      if (!response.ok) {
        throw new Error(nextPayload.message || "This booking request response could not be sent.");
      }
      setPayload((current) =>
        current
          ? {
              record: nextPayload.record,
              confirmationUrl: nextPayload.confirmationUrl ?? current.confirmationUrl,
              portalUrl: nextPayload.portalUrl ?? current.portalUrl,
              scheduledFor: nextPayload.scheduledFor ?? current.scheduledFor,
            }
          : null
      );
      setMessage("");
      if (mode === "alternate") {
        toast.success(nextPayload.scheduledFor ? `Confirmed for ${nextPayload.scheduledFor}.` : "That alternate time is confirmed.");
      } else if (mode === "request") {
        toast.success("Your updated time request was sent to the shop.");
      } else {
        toast.success("The shop was notified that you are passing on this request.");
      }
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "This booking request response could not be sent.");
    } finally {
      setSubmitting(null);
    }
  };

  const handleSubmitNewTime = async () => {
    if (!record) return;
    const dateKey = requestDate ? toDateKey(requestDate) : "";
    if (!dateKey) {
      toast.error("Choose the day that works best for you.");
      return;
    }
    const exactOnly = requestPolicy.requireExactTime || !requestPolicy.allowTimeWindows;
    if ((exactOnly || timingMode === "exact") && !exactTime) {
      toast.error("Choose the time you want the shop to review.");
      return;
    }
    if (!exactOnly && timingMode === "window" && !timeWindow.trim()) {
      toast.error("Choose a time window so the shop knows what to review.");
      return;
    }

    await submitResponse(
      {
        action: "request_new_time",
        requestedDate: dateKey,
        requestedTimeStart: exactOnly || timingMode === "exact" ? combineDateAndTime(dateKey, exactTime) : "",
        requestedTimeLabel: !exactOnly && timingMode === "window" ? timeWindow : "",
        flexibility: requestPolicy.allowFlexibility ? flexibility : "same_day_flexible",
        customerTimezone: browserTimezone,
        message,
      },
      "request"
    );
  };

  const timeOptions = useMemo(() => {
    const options: string[] = [];
    for (let hour = 7; hour <= 19; hour += 1) {
      for (const minute of [0, 30]) {
        if (hour === 19 && minute > 0) continue;
        options.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
      }
    }
    return options;
  }, []);

  const serviceLocation = record ? buildServiceLocation(record) : null;
  const nextStepSummary = record
    ? record.status === "confirmed"
      ? "The appointment is locked in. Use the confirmation or customer hub links below if you need them."
      : record.ownerReviewStatus === "proposed_alternates"
        ? "Choose one of the proposed times or send a different preferred day and time."
        : record.ownerReviewStatus === "requested_new_time"
          ? "The shop needs a different day or time from you before they can confirm this request."
          : "The shop is reviewing your request and may confirm it or send alternate times."
    : "";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <Card className="mx-auto w-full max-w-3xl border-slate-200/80 bg-white/92">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">Booking request</Badge>
              <CardTitle>Loading your request...</CardTitle>
              <CardDescription>Pulling in the requested time, shop response, and next available action.</CardDescription>
            </CardHeader>
          </Card>
        ) : error || !record ? (
          <Card className="mx-auto w-full max-w-3xl border-rose-200 bg-white">
            <CardHeader>
              <Badge variant="secondary" className="w-fit bg-rose-100 text-rose-900">Link problem</Badge>
              <CardTitle>This booking request link is unavailable</CardTitle>
              <CardDescription>{error || "The link may have expired or been opened incorrectly."}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/">Back to Strata</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="border-slate-200/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <CardHeader className="gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Badge variant="secondary" className="w-fit">Booking request</Badge>
                    <CardTitle className="text-3xl tracking-tight text-slate-950">Respond to your requested time</CardTitle>
                    <CardDescription className="max-w-2xl text-sm leading-6 text-slate-600">
                      {experienceCopy.ownerResponsePage ||
                        `${record.businessName || "The shop"} already has your service details. ${nextStepSummary}`}
                    </CardDescription>
                  </div>
                  <Badge className={cn("rounded-full px-3 py-1.5", statusBadge(record.status))}>{statusLabel(record.status)}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[1.35rem] border border-orange-200/80 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.14),transparent_36%),linear-gradient(180deg,#fff7ed_0%,#ffffff_100%)] p-4">
                    <div className="flex items-center gap-2 text-orange-700">
                      <Clock3 className="h-4 w-4" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Original request</p>
                    </div>
                    <p className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
                      {record.requestedTimingSummary || "Requested time on file"}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">{flexibilityLabel(record.flexibility)}</p>
                  </div>
                  <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Sparkles className="h-4 w-4" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Service</p>
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-950">{record.serviceSummary || "Requested service"}</p>
                    <p className="mt-2 text-sm text-slate-600">{record.serviceMode === "mobile" ? "Mobile service" : "In-shop service"}</p>
                  </div>
                  <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <CarFront className="h-4 w-4" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Vehicle</p>
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-950">{record.vehicle.summary || "Vehicle on file"}</p>
                    {record.vehicle.color ? (
                      <p className="mt-2 text-sm text-slate-600">{record.vehicle.color}</p>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">Vehicle details stay attached to this request.</p>
                    )}
                  </div>
                  <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <ArrowRight className="h-4 w-4" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Next step</p>
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-950">{statusLabel(record.status)}</p>
                    <p className="mt-2 text-sm text-slate-600">{nextStepSummary}</p>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
              <Card className="border-slate-200/80 bg-white">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-slate-600" />
                    <CardTitle>Request details</CardTitle>
                  </div>
                  <CardDescription>Everything stays tied to this request so you never have to start over.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Requested date and time</p>
                      <p className="text-sm font-medium text-slate-950">{record.requestedTimingSummary || "Requested time on file"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Submitted</p>
                      <p className="text-sm font-medium text-slate-950">{formatDateTime(record.submittedAt, record.customerTimezone)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Service</p>
                      <p className="text-sm font-medium text-slate-950">{record.serviceSummary || "Requested service"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vehicle</p>
                      <p className="text-sm font-medium text-slate-950">{record.vehicle.summary || "Vehicle on file"}</p>
                    </div>
                  </div>
                  {serviceLocation ? (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {record.serviceMode === "mobile" ? "Service address" : "Location"}
                      </p>
                      <p className="text-sm font-medium text-slate-950">{serviceLocation}</p>
                    </div>
                  ) : null}
                  {record.notes ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Your notes</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{record.notes}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 bg-white">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-600" />
                    <CardTitle>What happens next</CardTitle>
                  </div>
                  <CardDescription>
                    {record.status === "confirmed"
                      ? "You are all set."
                      : record.ownerReviewStatus === "proposed_alternates"
                        ? "Pick one of the times below or send another day."
                        : experienceCopy.chooseAnotherDay ||
                          "Send the shop another time that works better for you."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="font-medium text-slate-950">
                      {record.status === "confirmed"
                        ? payload?.scheduledFor || "Confirmed"
                        : record.ownerReviewStatus === "proposed_alternates"
                          ? "Alternate times are ready"
                          : "The shop needs another date or time"}
                    </p>
                    <p className="mt-1 leading-6">
                      {record.status === "confirmed"
                        ? "Use the confirmation links below any time."
                        : record.ownerReviewStatus === "proposed_alternates"
                          ? "Tap one option to confirm it instantly, or send another preferred day and time."
                          : "Choose a new date and time below. Your service and vehicle stay attached to this request."}
                    </p>
                  </div>
                  {record.expiresAt ? (
                    <p className="text-xs text-slate-500">This response link is active through {formatDateTime(record.expiresAt, record.customerTimezone)}.</p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
            {record.ownerResponseMessage ? (
              <Card className="border-slate-200/80 bg-white">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <MessageSquareMore className="h-4 w-4 text-slate-600" />
                    <CardTitle>Latest shop message</CardTitle>
                  </div>
                  <CardDescription>{record.ownerResponseMessage}</CardDescription>
                </CardHeader>
              </Card>
            ) : null}

            {record.status === "confirmed" ? (
              <Card className="border-emerald-200 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_42%),linear-gradient(180deg,#ffffff_0%,#f0fdf4_100%)] shadow-[0_20px_60px_rgba(16,185,129,0.14)]">
                <CardHeader className="gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle>Your booking is confirmed</CardTitle>
                      <CardDescription>
                        {experienceCopy.alternateAcceptance ||
                          "The shop locked in your appointment and sent the final confirmation."}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-200/80 bg-white/80 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Scheduled for</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{payload?.scheduledFor || "Confirmed"}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200/80 bg-white/80 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Service</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{record.serviceSummary || "Requested service"}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200/80 bg-white/80 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Vehicle</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{record.vehicle.summary || "Vehicle on file"}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  {payload?.confirmationUrl ? (
                    <Button asChild>
                      <a href={payload.confirmationUrl}>
                        Open confirmation
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                  {payload?.portalUrl ? (
                    <Button asChild variant="outline">
                      <a href={payload.portalUrl}>
                        Customer hub
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {record.alternateSlotOptions.length > 0 ? (
              <Card className="border-slate-200/80 bg-white">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <MailCheck className="h-4 w-4 text-slate-600" />
                    <CardTitle>Alternate times from the shop</CardTitle>
                  </div>
                  <CardDescription>Pick one clear option below and the shop will lock it in without making you restart.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {record.alternateSlotOptions.map((option) => (
                    <div key={option.id} className="rounded-[1.3rem] border border-slate-200 bg-slate-50 px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <p className="text-base font-semibold text-slate-950">{option.label}</p>
                      <p className="mt-1 text-sm text-slate-600">{formatDateTime(option.startTime, record.customerTimezone)}</p>
                      <p className="mt-1 text-xs text-slate-500">Hold expires {formatDateTime(option.expiresAt, record.customerTimezone)}</p>
                      <div className="mt-4">
                        <Button
                          className="w-full"
                          disabled={submitting === "alternate" || !record.canRespond}
                          onClick={() => void submitResponse({ action: "accept_alternate", alternateSlotId: option.id }, "alternate")}
                        >
                          {submitting === "alternate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Accept this time
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {record.canRespond ? (
              <Card className="border-slate-200/80 bg-white">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-slate-600" />
                    <CardTitle>Need another day or time?</CardTitle>
                  </div>
                  <CardDescription>Pick a new date and time below. Your service and vehicle details stay attached.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <Label>Preferred date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start rounded-xl">
                            <CalendarClock className="mr-2 h-4 w-4" />
                            {requestDate ? formatDateLabel(toDateKey(requestDate), record.customerTimezone) : "Choose a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={requestDate ?? undefined} onSelect={(date) => date && setRequestDate(date)} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {requestPolicy.allowFlexibility ? (
                      <div className="space-y-2">
                        <Label>Flexibility</Label>
                        <Select value={flexibility} onValueChange={(value) => setFlexibility(value as Flexibility)}>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FLEXIBILITY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>

                  {requestAllowsWindowMode ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setTimingMode("exact")}
                        className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", timingMode === "exact" ? "border-orange-300 bg-orange-50 text-orange-900" : "border-slate-200 bg-white text-slate-600")}
                      >
                        Exact time
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimingMode("window")}
                        className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", timingMode === "window" ? "border-orange-300 bg-orange-50 text-orange-900" : "border-slate-200 bg-white text-slate-600")}
                      >
                        Time window
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                      This service needs one exact preferred time so the shop can review the slot cleanly.
                    </div>
                  )}

                  {!requestAllowsWindowMode || timingMode === "exact" ? (
                    <div className="space-y-2">
                      <Label>Preferred time</Label>
                      <Select value={exactTime} onValueChange={setExactTime}>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {timeOptions.map((option) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {WINDOW_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setTimeWindow(option)}
                          className={cn("rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors", timeWindow === option ? "border-orange-300 bg-orange-50 text-orange-950" : "border-slate-200 bg-white text-slate-700")}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="request-message">Optional message to the shop</Label>
                    <Textarea
                      id="request-message"
                      rows={4}
                      placeholder="Share anything helpful about the new day or time."
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button onClick={() => void handleSubmitNewTime()} disabled={submitting === "request"} className="sm:flex-1">
                      {submitting === "request" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Send new requested time
                    </Button>
                    <Button variant="outline" onClick={() => void submitResponse({ action: "decline", message }, "decline")} disabled={submitting === "decline"}>
                      {submitting === "decline" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                      Decline request
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : record.status !== "confirmed" ? (
              <Card className="border-slate-200/80 bg-white">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-600" />
                    <CardTitle>What happens next</CardTitle>
                  </div>
                  <CardDescription>
                    The shop already has your service and vehicle details and will follow up from here if anything changes.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
