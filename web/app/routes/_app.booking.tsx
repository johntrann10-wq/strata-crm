import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { Copy, ExternalLink, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../api";
import { useAction, useFindOne } from "../../hooks/useApi";
import type { AuthOutletContext } from "../../routes/_app";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  bookingBrandAccentColorOptions,
  bookingBrandBackgroundToneOptions,
  bookingBrandButtonStyleOptions,
  bookingBrandPrimaryColorOptions,
  resolveBookingBrandTheme,
  type BookingBrandAccentColorToken,
  type BookingBrandBackgroundToneToken,
  type BookingBrandButtonStyleToken,
  type BookingBrandPrimaryColorToken,
  type BookingBrandingTokens,
} from "@/lib/bookingBranding";

type BuilderTab = "branding" | "content" | "fields" | "convert";

type BusinessBookingBuilderRecord = {
  id: string;
  bookingEnabled?: boolean | null;
  bookingDefaultFlow?: "request" | "self_book" | null;
  bookingPageTitle?: string | null;
  bookingPageSubtitle?: string | null;
  bookingBrandLogoUrl?: string | null;
  bookingBrandPrimaryColorToken?: BookingBrandPrimaryColorToken | null;
  bookingBrandAccentColorToken?: BookingBrandAccentColorToken | null;
  bookingBrandBackgroundToneToken?: BookingBrandBackgroundToneToken | null;
  bookingBrandButtonStyleToken?: BookingBrandButtonStyleToken | null;
  bookingTrustBulletPrimary?: string | null;
  bookingTrustBulletSecondary?: string | null;
  bookingTrustBulletTertiary?: string | null;
  bookingConfirmationMessage?: string | null;
  bookingNotesPrompt?: string | null;
  bookingRequireEmail?: boolean | null;
  bookingRequirePhone?: boolean | null;
  bookingRequireVehicle?: boolean | null;
  bookingAllowCustomerNotes?: boolean | null;
  bookingShowPrices?: boolean | null;
  bookingShowDurations?: boolean | null;
  notificationAppointmentConfirmationEmailEnabled?: boolean | null;
  bookingUrgencyEnabled?: boolean | null;
  bookingUrgencyText?: string | null;
  bookingSlotIntervalMinutes?: number | null;
  bookingBufferMinutes?: number | null;
  bookingCapacityPerSlot?: number | null;
};

type BookingBuilderFormState = {
  bookingEnabled: boolean;
  bookingPageTitle: string;
  bookingPageSubtitle: string;
  bookingBrandLogoUrl: string;
  bookingBrandPrimaryColorToken: BookingBrandPrimaryColorToken;
  bookingBrandAccentColorToken: BookingBrandAccentColorToken;
  bookingBrandBackgroundToneToken: BookingBrandBackgroundToneToken;
  bookingBrandButtonStyleToken: BookingBrandButtonStyleToken;
  bookingTrustBulletPrimary: string;
  bookingTrustBulletSecondary: string;
  bookingTrustBulletTertiary: string;
  bookingDefaultFlow: "request" | "self_book";
  bookingConfirmationMessage: string;
  bookingNotesPrompt: string;
  bookingRequireEmail: boolean;
  bookingRequirePhone: boolean;
  bookingRequireVehicle: boolean;
  bookingAllowCustomerNotes: boolean;
  bookingShowPrices: boolean;
  bookingShowDurations: boolean;
  notificationAppointmentConfirmationEmailEnabled: boolean;
  bookingUrgencyEnabled: boolean;
  bookingUrgencyText: string;
  bookingSlotIntervalMinutes: 15 | 30 | 45 | 60;
  bookingBufferMinutes: string;
  bookingCapacityPerSlot: string;
};

const defaultForm: BookingBuilderFormState = {
  bookingEnabled: false,
  bookingPageTitle: "",
  bookingPageSubtitle: "",
  bookingBrandLogoUrl: "",
  bookingBrandPrimaryColorToken: "orange",
  bookingBrandAccentColorToken: "amber",
  bookingBrandBackgroundToneToken: "ivory",
  bookingBrandButtonStyleToken: "solid",
  bookingTrustBulletPrimary: "Goes directly to the shop",
  bookingTrustBulletSecondary: "Quick follow-up",
  bookingTrustBulletTertiary: "Secure and simple",
  bookingDefaultFlow: "request",
  bookingConfirmationMessage: "",
  bookingNotesPrompt: "Add timing, questions, or anything the shop should know.",
  bookingRequireEmail: false,
  bookingRequirePhone: false,
  bookingRequireVehicle: true,
  bookingAllowCustomerNotes: true,
  bookingShowPrices: true,
  bookingShowDurations: true,
  notificationAppointmentConfirmationEmailEnabled: true,
  bookingUrgencyEnabled: false,
  bookingUrgencyText: "Only 3 spots left this week",
  bookingSlotIntervalMinutes: 15,
  bookingBufferMinutes: "",
  bookingCapacityPerSlot: "",
};

function toForm(record?: BusinessBookingBuilderRecord | null): BookingBuilderFormState {
  const flow = record?.bookingDefaultFlow === "self_book" ? "self_book" : "request";
  return {
    bookingEnabled: record?.bookingEnabled === true,
    bookingPageTitle: record?.bookingPageTitle ?? "",
    bookingPageSubtitle: record?.bookingPageSubtitle ?? "",
    bookingBrandLogoUrl: record?.bookingBrandLogoUrl ?? "",
    bookingBrandPrimaryColorToken: record?.bookingBrandPrimaryColorToken ?? "orange",
    bookingBrandAccentColorToken: record?.bookingBrandAccentColorToken ?? "amber",
    bookingBrandBackgroundToneToken: record?.bookingBrandBackgroundToneToken ?? "ivory",
    bookingBrandButtonStyleToken: record?.bookingBrandButtonStyleToken ?? "solid",
    bookingTrustBulletPrimary: record?.bookingTrustBulletPrimary ?? "Goes directly to the shop",
    bookingTrustBulletSecondary:
      record?.bookingTrustBulletSecondary ?? (flow === "self_book" ? "Quick confirmation" : "Quick follow-up"),
    bookingTrustBulletTertiary: record?.bookingTrustBulletTertiary ?? "Secure and simple",
    bookingDefaultFlow: flow,
    bookingConfirmationMessage: record?.bookingConfirmationMessage ?? "",
    bookingNotesPrompt: record?.bookingNotesPrompt ?? defaultForm.bookingNotesPrompt,
    bookingRequireEmail: record?.bookingRequireEmail === true,
    bookingRequirePhone: record?.bookingRequirePhone === true,
    bookingRequireVehicle: record?.bookingRequireVehicle !== false,
    bookingAllowCustomerNotes: record?.bookingAllowCustomerNotes !== false,
    bookingShowPrices: record?.bookingShowPrices !== false,
    bookingShowDurations: record?.bookingShowDurations !== false,
    notificationAppointmentConfirmationEmailEnabled:
      record?.notificationAppointmentConfirmationEmailEnabled !== false,
    bookingUrgencyEnabled: record?.bookingUrgencyEnabled === true,
    bookingUrgencyText: record?.bookingUrgencyText ?? defaultForm.bookingUrgencyText,
    bookingSlotIntervalMinutes:
      record?.bookingSlotIntervalMinutes === 30 ||
      record?.bookingSlotIntervalMinutes === 45 ||
      record?.bookingSlotIntervalMinutes === 60
        ? record.bookingSlotIntervalMinutes
        : 15,
    bookingBufferMinutes:
      record?.bookingBufferMinutes != null && Number.isFinite(record.bookingBufferMinutes)
        ? String(record.bookingBufferMinutes)
        : "",
    bookingCapacityPerSlot:
      record?.bookingCapacityPerSlot != null && Number.isFinite(record.bookingCapacityPerSlot)
        ? String(record.bookingCapacityPerSlot)
        : "",
  };
}

function toBrandingTokens(form: BookingBuilderFormState): BookingBrandingTokens {
  return {
    primaryColorToken: form.bookingBrandPrimaryColorToken,
    accentColorToken: form.bookingBrandAccentColorToken,
    backgroundToneToken: form.bookingBrandBackgroundToneToken,
    buttonStyleToken: form.bookingBrandButtonStyleToken,
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor={id} className="text-sm font-semibold text-slate-950">
            {label}
          </Label>
          <p className="text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      </div>
    </div>
  );
}

export default function BookingBuilderPage() {
  const { businessId, permissions } = useOutletContext<AuthOutletContext>();
  const canRead = permissions.has("settings.read");
  const canEdit = permissions.has("settings.write");
  const [activeTab, setActiveTab] = useState<BuilderTab>("branding");
  const [form, setForm] = useState<BookingBuilderFormState>(defaultForm);
  const [savedForm, setSavedForm] = useState<BookingBuilderFormState>(defaultForm);
  const [previewNonce, setPreviewNonce] = useState(0);

  const [{ data: business, fetching, error }, refetchBusiness] = useFindOne(api.business, businessId ?? "", {
    pause: !businessId || !canRead,
  });
  const [{ fetching: saving }, runUpdateBusiness] = useAction(api.business.update);

  const businessRecord = (business as BusinessBookingBuilderRecord | undefined) ?? null;

  useEffect(() => {
    if (!businessRecord) return;
    const next = toForm(businessRecord);
    setForm(next);
    setSavedForm(next);
  }, [businessRecord]);

  const bookingUrl = useMemo(() => {
    if (!businessId || typeof window === "undefined") return "";
    return `${window.location.origin}/book/${businessId}`;
  }, [businessId]);
  const previewUrl = useMemo(
    () => (bookingUrl ? `${bookingUrl}?builderPreview=${previewNonce}` : "about:blank"),
    [bookingUrl, previewNonce]
  );
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
  const bookingTheme = useMemo(() => resolveBookingBrandTheme(toBrandingTokens(form)), [form]);

  const updateField = <K extends keyof BookingBuilderFormState>(key: K, value: BookingBuilderFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveChanges = async () => {
    if (!businessId || !canEdit) return;
    const supportsBookingBufferMinutes = !!businessRecord && Object.prototype.hasOwnProperty.call(businessRecord, "bookingBufferMinutes");
    const supportsBookingCapacityPerSlot =
      !!businessRecord && Object.prototype.hasOwnProperty.call(businessRecord, "bookingCapacityPerSlot");
    const payload = {
      id: businessId,
      bookingEnabled: form.bookingEnabled,
      bookingPageTitle: form.bookingPageTitle.trim() || null,
      bookingPageSubtitle: form.bookingPageSubtitle.trim() || null,
      bookingBrandLogoUrl: form.bookingBrandLogoUrl.trim() || null,
      bookingBrandPrimaryColorToken: form.bookingBrandPrimaryColorToken,
      bookingBrandAccentColorToken: form.bookingBrandAccentColorToken,
      bookingBrandBackgroundToneToken: form.bookingBrandBackgroundToneToken,
      bookingBrandButtonStyleToken: form.bookingBrandButtonStyleToken,
      bookingTrustBulletPrimary: form.bookingTrustBulletPrimary.trim() || null,
      bookingTrustBulletSecondary: form.bookingTrustBulletSecondary.trim() || null,
      bookingTrustBulletTertiary: form.bookingTrustBulletTertiary.trim() || null,
      bookingDefaultFlow: form.bookingDefaultFlow,
      bookingConfirmationMessage: form.bookingConfirmationMessage.trim() || null,
      bookingNotesPrompt: form.bookingNotesPrompt.trim() || null,
      bookingRequireEmail: form.bookingRequireEmail,
      bookingRequirePhone: form.bookingRequirePhone,
      bookingRequireVehicle: form.bookingRequireVehicle,
      bookingAllowCustomerNotes: form.bookingAllowCustomerNotes,
      bookingShowPrices: form.bookingShowPrices,
      bookingShowDurations: form.bookingShowDurations,
      notificationAppointmentConfirmationEmailEnabled: form.notificationAppointmentConfirmationEmailEnabled,
      bookingUrgencyEnabled: form.bookingUrgencyEnabled,
      bookingUrgencyText: form.bookingUrgencyText.trim() || null,
      bookingSlotIntervalMinutes: form.bookingSlotIntervalMinutes,
      bookingRequestUrl: bookingUrl || null,
      ...((form.bookingBufferMinutes.trim() || supportsBookingBufferMinutes)
        ? { bookingBufferMinutes: form.bookingBufferMinutes.trim() ? Number(form.bookingBufferMinutes) : null }
        : {}),
      ...((form.bookingCapacityPerSlot.trim() || supportsBookingCapacityPerSlot)
        ? { bookingCapacityPerSlot: form.bookingCapacityPerSlot.trim() ? Number(form.bookingCapacityPerSlot) : null }
        : {}),
    };
    const result = await runUpdateBusiness(payload);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    setSavedForm(form);
    setPreviewNonce((current) => current + 1);
    toast.success("Booking builder updated.");
    void refetchBusiness();
  };

  const copyBookingUrl = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      toast.success("Booking URL copied.");
    } catch {
      toast.error("Could not copy the booking URL.");
    }
  };

  if (!businessId) {
    return (
      <div className="page-content page-section max-w-6xl">
        <PageHeader title="Booking builder" />
        <Card><CardContent className="p-6 text-sm text-slate-600">Pick a business first before configuring booking.</CardContent></Card>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="page-content page-section max-w-6xl">
        <PageHeader title="Booking builder" />
        <Card><CardContent className="p-6 text-sm text-slate-600">You do not have permission to view booking settings.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="page-content page-section max-w-[1400px]">
      <PageHeader
        title="Booking builder"
        right={
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/85 px-4 py-2 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div className="space-y-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
                <p className="text-sm font-semibold text-slate-950">{form.bookingEnabled ? "Live" : "Disabled"}</p>
              </div>
              <Switch checked={form.bookingEnabled} onCheckedChange={(next) => updateField("bookingEnabled", next)} disabled={!canEdit} />
            </div>
            <Button type="button" variant="outline" onClick={() => bookingUrl && window.open(bookingUrl, "_blank", "noopener,noreferrer")} disabled={!bookingUrl}>
              <ExternalLink className="mr-2 h-4 w-4" />
              View live
            </Button>
            <Button type="button" onClick={saveChanges} disabled={!canEdit || !dirty || saving} className={cn("min-w-[150px]", bookingTheme.primaryButtonClassName)}>
              {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="border-slate-200/80 bg-white/92 shadow-[0_28px_80px_rgba(15,23,42,0.08)] lg:w-[280px]">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Flow editor</CardTitle>
            <CardDescription>Business-level booking controls with a live public preview on the right.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs value={activeTab} onValueChange={(next) => setActiveTab(next as BuilderTab)} className="gap-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="branding">Branding</TabsTrigger>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="fields">Fields</TabsTrigger>
                <TabsTrigger value="convert">Convert</TabsTrigger>
              </TabsList>

              <TabsContent value="branding" className="space-y-3">
                <Field label="Portal name"><Input value={form.bookingPageTitle} onChange={(e) => updateField("bookingPageTitle", e.target.value)} placeholder="Spark Studio" disabled={!canEdit} /></Field>
                <Field label="Tagline"><Input value={form.bookingPageSubtitle} onChange={(e) => updateField("bookingPageSubtitle", e.target.value)} placeholder="Professional photography & video" disabled={!canEdit} /></Field>
                <Field label="Logo URL"><Input value={form.bookingBrandLogoUrl} onChange={(e) => updateField("bookingBrandLogoUrl", e.target.value)} placeholder="https://..." disabled={!canEdit} /></Field>
                <Field label="Primary color"><Select value={form.bookingBrandPrimaryColorToken} onValueChange={(next) => updateField("bookingBrandPrimaryColorToken", next as BookingBrandPrimaryColorToken)} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{bookingBrandPrimaryColorOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Accent color"><Select value={form.bookingBrandAccentColorToken} onValueChange={(next) => updateField("bookingBrandAccentColorToken", next as BookingBrandAccentColorToken)} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{bookingBrandAccentColorOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Background tone"><Select value={form.bookingBrandBackgroundToneToken} onValueChange={(next) => updateField("bookingBrandBackgroundToneToken", next as BookingBrandBackgroundToneToken)} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{bookingBrandBackgroundToneOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Button style"><Select value={form.bookingBrandButtonStyleToken} onValueChange={(next) => updateField("bookingBrandButtonStyleToken", next as BookingBrandButtonStyleToken)} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{bookingBrandButtonStyleOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Meta line 1"><Input value={form.bookingTrustBulletPrimary} onChange={(e) => updateField("bookingTrustBulletPrimary", e.target.value)} placeholder="5.0" disabled={!canEdit} /></Field>
                <Field label="Meta line 2"><Input value={form.bookingTrustBulletSecondary} onChange={(e) => updateField("bookingTrustBulletSecondary", e.target.value)} placeholder="200+ clients" disabled={!canEdit} /></Field>
                <Field label="Meta line 3"><Input value={form.bookingTrustBulletTertiary} onChange={(e) => updateField("bookingTrustBulletTertiary", e.target.value)} placeholder="Verified" disabled={!canEdit} /></Field>
              </TabsContent>

              <TabsContent value="content" className="space-y-3">
                <Field label="Booking flow"><Select value={form.bookingDefaultFlow} onValueChange={(next) => updateField("bookingDefaultFlow", next as "request" | "self_book")} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="request">Request</SelectItem><SelectItem value="self_book">Self book</SelectItem></SelectContent></Select></Field>
                <Field label="Confirmation message"><Textarea value={form.bookingConfirmationMessage} onChange={(e) => updateField("bookingConfirmationMessage", e.target.value)} rows={4} disabled={!canEdit} /></Field>
                <Field label="Notes prompt"><Input value={form.bookingNotesPrompt} onChange={(e) => updateField("bookingNotesPrompt", e.target.value)} disabled={!canEdit} /></Field>
                <Field label="Booking URL">
                  <div className="flex gap-2">
                    <Input value={bookingUrl} readOnly />
                    <Button type="button" variant="outline" size="icon" onClick={copyBookingUrl} disabled={!bookingUrl}><Copy className="h-4 w-4" /></Button>
                  </div>
                </Field>
              </TabsContent>

              <TabsContent value="fields" className="space-y-3">
                <ToggleRow id="require-email" label="Require email" description="Ask for email before booking can continue." checked={form.bookingRequireEmail} onCheckedChange={(next) => updateField("bookingRequireEmail", next)} disabled={!canEdit} />
                <ToggleRow id="require-phone" label="Require phone" description="Collect a phone number before submission." checked={form.bookingRequirePhone} onCheckedChange={(next) => updateField("bookingRequirePhone", next)} disabled={!canEdit} />
                <ToggleRow id="require-vehicle" label="Require vehicle info" description="Keep vehicle details in the booking flow." checked={form.bookingRequireVehicle} onCheckedChange={(next) => updateField("bookingRequireVehicle", next)} disabled={!canEdit} />
                <ToggleRow id="allow-notes" label="Allow customer notes" description="Show the notes field in the review step." checked={form.bookingAllowCustomerNotes} onCheckedChange={(next) => updateField("bookingAllowCustomerNotes", next)} disabled={!canEdit} />
                <ToggleRow id="show-prices" label="Show prices" description="Display visible pricing on the public booking page." checked={form.bookingShowPrices} onCheckedChange={(next) => updateField("bookingShowPrices", next)} disabled={!canEdit} />
                <ToggleRow id="show-durations" label="Show durations" description="Display visible duration details on the public booking page." checked={form.bookingShowDurations} onCheckedChange={(next) => updateField("bookingShowDurations", next)} disabled={!canEdit} />
                <ToggleRow id="confirmation-email" label="Send confirmation email" description="Use the existing confirmation email after self-booking." checked={form.notificationAppointmentConfirmationEmailEnabled} onCheckedChange={(next) => updateField("notificationAppointmentConfirmationEmailEnabled", next)} disabled={!canEdit} />
              </TabsContent>

              <TabsContent value="convert" className="space-y-3">
                <ToggleRow id="urgency-enabled" label="Urgency cues" description="Enable urgency messaging on the public booking page." checked={form.bookingUrgencyEnabled} onCheckedChange={(next) => updateField("bookingUrgencyEnabled", next)} disabled={!canEdit} />
                <Field label="Urgency message"><Input value={form.bookingUrgencyText} onChange={(e) => updateField("bookingUrgencyText", e.target.value)} placeholder="Only 3 spots left this week" disabled={!canEdit} /></Field>
                <Field label="Slot interval"><Select value={String(form.bookingSlotIntervalMinutes)} onValueChange={(next) => updateField("bookingSlotIntervalMinutes", Number(next) as 15 | 30 | 45 | 60)} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="15">15 minutes</SelectItem><SelectItem value="30">30 minutes</SelectItem><SelectItem value="45">45 minutes</SelectItem><SelectItem value="60">60 minutes</SelectItem></SelectContent></Select></Field>
                <Field label="Buffer minutes"><Input inputMode="numeric" value={form.bookingBufferMinutes} onChange={(e) => updateField("bookingBufferMinutes", e.target.value)} placeholder="15" disabled={!canEdit} /></Field>
                <Field label="Capacity per slot"><Input inputMode="numeric" value={form.bookingCapacityPerSlot} onChange={(e) => updateField("bookingCapacityPerSlot", e.target.value)} placeholder="1" disabled={!canEdit} /></Field>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200/80 bg-white/92 shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
          <CardHeader className="border-b border-slate-200/80 bg-slate-50/85">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base">Live preview</CardTitle>
                <CardDescription>Points at the real public booking page and refreshes after save.</CardDescription>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                <span className={cn("h-2 w-2 rounded-full", form.bookingEnabled ? "bg-emerald-500" : "bg-slate-300")} />
                {form.bookingEnabled ? "Live" : "Disabled"}
              </div>
            </div>
          </CardHeader>
          <CardContent className="bg-slate-100/70 p-3 sm:p-4">
            {fetching ? (
              <div className="flex h-[760px] items-center justify-center rounded-[28px] border border-slate-200 bg-white"><LoaderCircle className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : error ? (
              <div className="flex h-[760px] items-center justify-center rounded-[28px] border border-red-200 bg-white px-6 text-center text-sm text-red-600">{error.message}</div>
            ) : (
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                <div className="border-b border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{form.bookingPageTitle.trim() || "Tell us what you need"}</p>
                      <p className="truncate text-xs text-slate-500">{bookingUrl || "Booking URL unavailable"}</p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {bookingTheme.tokens.primaryColorToken}
                    </div>
                  </div>
                </div>
                <iframe title="Booking builder preview" src={previewUrl} className="h-[760px] w-full border-0 bg-white" loading="lazy" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
