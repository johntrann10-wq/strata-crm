import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useAction, useFindFirst } from "../hooks/useApi";
import { api } from "../api";
import { setCurrentBusinessId } from "../lib/auth";
import {
  BUSINESS_TYPE_WORKSPACE_DEFAULTS,
  getBusinessTypeWorkspaceDefaults,
} from "../lib/businessTypeWorkspaceDefaults";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StrataLogoLockup } from "@/components/brand/StrataLogo";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Droplets,
  Gauge,
  Layers3,
  Receipt,
  Shield,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import type { CSSProperties } from "react";

const ONBOARDING_FORM_ID = "onboarding-business-form";
const onboardingInputClass =
  "h-11 rounded-lg border-[#2a2a2a] bg-[#1a1a1a] placeholder:text-[#7d8695]";
const onboardingInputStyle: CSSProperties = {
  color: "#f4f4f5",
  WebkitTextFillColor: "#f4f4f5",
  caretColor: "#f4f4f5",
};

type BusinessTypeValue =
  | "auto_detailing"
  | "mobile_detailing"
  | "wrap_ppf"
  | "window_tinting"
  | "performance"
  | "mechanic"
  | "tire_shop"
  | "muffler_shop";

const businessTypeIcons: Record<BusinessTypeValue, typeof Droplets> = {
  auto_detailing: Droplets,
  mobile_detailing: Truck,
  wrap_ppf: Shield,
  window_tinting: CircleDot,
  performance: Gauge,
  mechanic: Wrench,
  tire_shop: CircleDot,
  muffler_shop: Wrench,
};

type FormData = { name: string; phone: string; email: string; address: string; city: string; state: string; zip: string };

function ProgressIndicator({ step }: { step: number }) {
  const steps = [
    { id: 1, label: "Choose your shop" },
    { id: 2, label: "Launch your workspace" },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {steps.map((item, index) => (
          <div key={item.id} className="flex shrink-0 items-center gap-3">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold", item.id <= step ? "bg-orange-500 text-white" : "bg-[#2a2a2a] text-[#6b7280]")}>
              {item.id}
            </div>
            <span className={cn("whitespace-nowrap text-sm font-medium", item.id === step ? "text-white" : "text-[#6b7280]")}>{item.label}</span>
            {index < steps.length - 1 ? <div className={cn("h-px w-10", step > item.id ? "bg-orange-500" : "bg-[#2a2a2a]")} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<BusinessTypeValue | null>(null);
  const [staffCount, setStaffCount] = useState("1");
  const [operatingHours, setOperatingHours] = useState({ days: "Mon-Fri", open: "09:00", close: "17:00" });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOptionalBasics, setShowOptionalBasics] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ name: "", phone: "", email: "", address: "", city: "", state: "", zip: "" });

  const [{ data: existingBusiness, fetching: businessLoading }] = useFindFirst(api.business, {
    select: { id: true, name: true, type: true, phone: true, email: true, address: true, city: true, state: true, zip: true, staffCount: true, operatingHours: true, onboardingComplete: true },
  } as any);
  const [{ fetching: creating, error }, createBusiness] = useAction(api.business.create);
  const [{ fetching: updating }, updateBusiness] = useAction(api.business.update);
  const fetching = creating || updating;

  useEffect(() => {
    if (!existingBusiness) return;
    if (existingBusiness.onboardingComplete === true) {
      navigate("/subscribe", { replace: true });
      return;
    }
    setSelectedType((existingBusiness.type as BusinessTypeValue | null) ?? null);
    setFormData({
      name: existingBusiness.name ?? "",
      phone: existingBusiness.phone ?? "",
      email: existingBusiness.email ?? "",
      address: existingBusiness.address ?? "",
      city: existingBusiness.city ?? "",
      state: existingBusiness.state ?? "",
      zip: existingBusiness.zip ?? "",
    });
    setStaffCount(typeof existingBusiness.staffCount === "number" ? String(existingBusiness.staffCount) : "1");
    const rawHours = typeof existingBusiness.operatingHours === "string" ? existingBusiness.operatingHours : "";
    const match = rawHours.match(/^(.*)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (match) setOperatingHours({ days: match[1], open: match[2], close: match[3] });
  }, [existingBusiness, navigate]);

  const selectedTypeMeta = useMemo(
    () => (selectedType ? getBusinessTypeWorkspaceDefaults(selectedType) : null),
    [selectedType]
  );

  useEffect(() => {
    if (!selectedTypeMeta || existingBusiness?.id) return;
    setStaffCount(selectedTypeMeta.defaultStaffCount);
    setOperatingHours({ days: selectedTypeMeta.defaultDays, open: selectedTypeMeta.defaultOpen, close: selectedTypeMeta.defaultClose });
  }, [selectedTypeMeta, existingBusiness?.id]);

  const handleFieldChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((current) => ({ ...current, [field]: e.target.value }));
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) {
      setValidationError("Please choose the kind of shop you run.");
      setStep(1);
      return;
    }
    const typeDefaults = getBusinessTypeWorkspaceDefaults(selectedType);
    if (!formData.name.trim()) {
      setValidationError("Business name is required.");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      type: selectedType as any,
      phone: formData.phone.trim() || undefined,
      email: formData.email.trim() || undefined,
      address: formData.address.trim() || undefined,
      city: formData.city.trim() || undefined,
      state: formData.state.trim() || undefined,
      zip: formData.zip.trim() || undefined,
      staffCount: Math.max(0, parseInt(staffCount, 10) || 0),
      operatingHours: `${operatingHours.days.trim() || "Mon-Fri"} ${operatingHours.open}-${operatingHours.close}`,
      defaultTaxRate: typeDefaults.defaultTaxRate,
      appointmentBufferMinutes: typeDefaults.appointmentBufferMinutes,
    };

    const result = existingBusiness?.id ? await updateBusiness({ id: existingBusiness.id, ...payload }) : await createBusiness(payload);
    if (result.error) {
      setValidationError(result.error.message ?? "Could not save your business.");
      return;
    }

    const saved = result.data as { id?: string } | undefined;
    if (!saved?.id) {
      setValidationError("Unexpected response from server.");
      return;
    }

    try {
      await api.business.completeOnboarding(saved.id);
      setCurrentBusinessId(saved.id);
      toast.success("Workspace ready.");
      window.location.replace("/subscribe");
    } catch (submitError) {
      setValidationError(submitError instanceof Error ? submitError.message : "Could not finish setup.");
    }
  };

  if (businessLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4 text-sm text-[#9ca3af]">Loading your workspace setup...</div>;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_20%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_18%),linear-gradient(180deg,#0b0d10_0%,#0f1115_55%,#11141a_100%)] text-white">
      <div className="border-b border-[#1f1f1f]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <StrataLogoLockup
            markClassName="h-8 w-8"
            wordmarkClassName="text-lg font-bold tracking-tight text-white"
          />
          <span className="hidden text-sm text-[#6b7280] sm:inline">Get operational in minutes</span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-3 py-4 pb-32 sm:px-6 sm:py-12 sm:pb-12">
        <ProgressIndicator step={step} />

        {step === 1 ? (
          <section className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
            <div>
              <div className="mb-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-orange-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Built for fast launch
                </div>
                <h1 className="mb-3 mt-4 text-3xl font-semibold tracking-[-0.05em] sm:text-[3.4rem]">Choose your shop type</h1>
                <p className="max-w-2xl text-sm leading-7 text-[#aab3c2] sm:text-lg">
                  Pick the kind of shop you run. Strata will shape the workspace around your real operating model so you
                  start with realistic defaults and a workflow that already makes sense.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {BUSINESS_TYPE_WORKSPACE_DEFAULTS.map((type) => {
                  const Icon = businessTypeIcons[type.value];
                  return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => {
                      setSelectedType(type.value);
                      setValidationError(null);
                    }}
                    className={cn(
                      "rounded-[1.35rem] border p-4 text-left transition-all sm:p-5",
                      selectedType === type.value
                        ? "border-orange-500 bg-[linear-gradient(180deg,rgba(38,25,16,0.96),rgba(23,19,17,0.98))] shadow-[0_18px_40px_rgba(249,115,22,0.12)]"
                        : "border-[#2a2a2a] bg-[linear-gradient(180deg,#141414_0%,#121212_100%)] hover:border-orange-500/60 hover:bg-[#1a1714]"
                    )}
                  >
                    <Icon className="mb-3 h-8 w-8 text-orange-300" />
                    <p className={cn("mb-1 text-sm font-semibold sm:text-base", selectedType === type.value ? "text-orange-300" : "text-white")}>{type.label}</p>
                    <p className="text-xs leading-snug text-[#8b929f] sm:text-sm">{type.description}</p>
                  </button>
                )})}
              </div>
              {validationError ? <p className="mt-4 text-sm text-red-400">{validationError}</p> : null}
              <div className="hidden pt-4 sm:flex">
                <Button type="button" onClick={() => (selectedType ? setStep(2) : setValidationError("Please choose the kind of shop you run."))} disabled={!selectedType} className="h-11 rounded-lg bg-orange-500 px-8 font-semibold text-white hover:bg-orange-400">
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.10),transparent_26%),linear-gradient(180deg,#17181d_0%,#111217_100%)] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.32)] sm:p-6">
              {selectedTypeMeta ? (
                <div className="space-y-5">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-200">
                      {(() => {
                        const Icon = businessTypeIcons[selectedTypeMeta.value];
                        return <Icon className="h-3.5 w-3.5" />;
                      })()}
                      {selectedTypeMeta.label}
                    </div>
                    <h2 className="mt-4 text-xl font-semibold">You will start with a usable workspace</h2>
                    <p className="mt-2 text-sm leading-6 text-[#9ca3af]">No blank setup. Strata will shape workflow defaults, booking settings, and day-one language around this shop type.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-[#7c8594]">Default schedule</p>
                      <p className="mt-2 text-lg font-semibold">{selectedTypeMeta.defaultDays}</p>
                      <p className="mt-1 text-sm text-[#9ca3af]">{selectedTypeMeta.defaultOpen}-{selectedTypeMeta.defaultClose}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-[#7c8594]">Default schedule buffer</p>
                      <p className="mt-2 text-2xl font-semibold">{selectedTypeMeta.appointmentBufferMinutes} min</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-start gap-3">
                      <Layers3 className="mt-0.5 h-4 w-4 text-orange-300" />
                      <div>
                        <p className="text-xs uppercase tracking-[0.12em] text-[#7c8594]">Default workflow</p>
                        <p className="mt-2 text-sm font-medium text-white">{selectedTypeMeta.workflowTitle}</p>
                        <p className="mt-1 text-sm text-[#9ca3af]">{selectedTypeMeta.workflowSummary}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-start gap-3">
                      <CalendarDays className="mt-0.5 h-4 w-4 text-orange-300" />
                      <div>
                        <p className="text-xs uppercase tracking-[0.12em] text-[#7c8594]">Booking defaults</p>
                        <p className="mt-2 text-sm text-white">{selectedTypeMeta.bookingSettingsLabel}</p>
                        <p className="mt-1 text-sm text-[#9ca3af]">Default appointment buffer: {selectedTypeMeta.appointmentBufferMinutes} minutes</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-[#7c8594]">Estimate and invoice defaults</p>
                    <div className="mt-3 space-y-2 text-sm text-[#d4d8de]">
                      <p>{selectedTypeMeta.estimateTemplateSummary}</p>
                      <p className="text-[#9ca3af]">{selectedTypeMeta.invoiceTemplateSummary}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-[#7c8594]">Day-one status language</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedTypeMeta.statusLabels.map((label) => (
                        <span key={label} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-white/85">{label}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#2b2b2b] bg-[#121212] p-5 text-sm text-[#8b929f]">Pick a business type to preview the workspace defaults.</div>
              )}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="mb-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-orange-200">
                  <Receipt className="h-3.5 w-3.5" />
                  Finish setup
                </div>
                <h1 className="mb-3 mt-4 text-3xl font-semibold tracking-[-0.05em] sm:text-[3.2rem]">Launch your workspace</h1>
                <p className="max-w-2xl text-sm leading-7 text-[#aab3c2] sm:text-lg">
                  Only your business name is required to get operational. Everything else can wait until after you start booking real work.
                </p>
              </div>

              <form id={ONBOARDING_FORM_ID} onSubmit={handleSubmit} className="space-y-5 rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,#15171b_0%,#121317_100%)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-6">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium text-[#d1d5db]">Business name <span className="text-orange-500">*</span></Label>
                  <Input id="name" value={formData.name} onChange={handleFieldChange("name")} placeholder={selectedTypeMeta?.exampleName ?? "Your business name"} required className={onboardingInputClass} data-onboarding-input="true" style={onboardingInputStyle} />
                  <p className="text-xs text-[#8b929f]">This is the only thing you need to enter right now.</p>
                </div>

                <div className="rounded-2xl border border-[#262626] bg-[#111111]">
                  <button type="button" onClick={() => setShowOptionalBasics((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                    <div>
                      <p className="text-sm font-medium text-white">Contact and shop address</p>
                      <p className="mt-1 text-xs text-[#8b929f]">Optional for now. Add this later if you just want to get into the product.</p>
                    </div>
                    {showOptionalBasics ? <ChevronUp className="h-4 w-4 text-[#8b929f]" /> : <ChevronDown className="h-4 w-4 text-[#8b929f]" />}
                  </button>
                  {showOptionalBasics ? (
                    <div className="space-y-4 border-t border-[#262626] px-4 pb-4 pt-3">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="phone" className="text-sm font-medium text-[#d1d5db]">Phone</Label>
                          <Input id="phone" type="tel" value={formData.phone} onChange={handleFieldChange("phone")} placeholder="(555) 000-0000" className={onboardingInputClass} data-onboarding-input="true" style={onboardingInputStyle} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="email" className="text-sm font-medium text-[#d1d5db]">Email</Label>
                          <Input id="email" type="email" value={formData.email} onChange={handleFieldChange("email")} placeholder="hello@yourbusiness.com" className={onboardingInputClass} data-onboarding-input="true" style={onboardingInputStyle} />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="address" className="text-sm font-medium text-[#d1d5db]">Address</Label>
                        <Input id="address" value={formData.address} onChange={handleFieldChange("address")} placeholder="123 Main St" className={onboardingInputClass} data-onboarding-input="true" style={onboardingInputStyle} />
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="city" className="text-sm font-medium text-[#d1d5db]">City</Label>
                          <Input id="city" value={formData.city} onChange={handleFieldChange("city")} placeholder="Los Angeles" className={onboardingInputClass} data-onboarding-input="true" style={onboardingInputStyle} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="state" className="text-sm font-medium text-[#d1d5db]">State</Label>
                          <Input id="state" value={formData.state} onChange={handleFieldChange("state")} placeholder="CA" maxLength={2} className={onboardingInputClass} data-onboarding-input="true" style={onboardingInputStyle} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="zip" className="text-sm font-medium text-[#d1d5db]">Zip</Label>
                          <Input id="zip" value={formData.zip} onChange={handleFieldChange("zip")} placeholder="90210" className={onboardingInputClass} data-onboarding-input="true" style={onboardingInputStyle} />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-[#262626] bg-[#111111]">
                  <button type="button" onClick={() => setShowAdvanced((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                    <div>
                      <p className="text-sm font-medium text-white">Advanced startup defaults</p>
                      <p className="mt-1 text-xs text-[#8b929f]">Optional. Team size and hours are already prefilled for your shop type.</p>
                    </div>
                    {showAdvanced ? <ChevronUp className="h-4 w-4 text-[#8b929f]" /> : <ChevronDown className="h-4 w-4 text-[#8b929f]" />}
                  </button>
                  {showAdvanced ? (
                    <div className="space-y-4 border-t border-[#262626] px-4 pb-4 pt-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="staffCount" className="text-sm font-medium text-[#d1d5db]">Number of staff</Label>
                        <Input id="staffCount" type="number" min={0} max={500} value={staffCount} onChange={(e) => setStaffCount(e.target.value)} className={`${onboardingInputClass} w-full sm:w-32`} data-onboarding-input="true" style={onboardingInputStyle} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-[#d1d5db]">Typical operating hours</Label>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr_auto_1fr] sm:items-center">
                          <Input value={operatingHours.days} onChange={(e) => setOperatingHours((current) => ({ ...current, days: e.target.value }))} className={onboardingInputClass} data-onboarding-input="true" style={onboardingInputStyle} />
                          <Input type="time" value={operatingHours.open} onChange={(e) => setOperatingHours((current) => ({ ...current, open: e.target.value }))} className={onboardingInputClass} data-onboarding-input="true" style={onboardingInputStyle} />
                          <span className="text-center text-[#6b7280]">to</span>
                          <Input type="time" value={operatingHours.close} onChange={(e) => setOperatingHours((current) => ({ ...current, close: e.target.value }))} className={onboardingInputClass} data-onboarding-input="true" style={onboardingInputStyle} />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {validationError ? <p className="text-sm text-red-400">{validationError}</p> : null}
                {error ? <p className="text-sm text-red-400">{error.message}</p> : null}

                <div className="hidden gap-3 pt-2 sm:flex">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="h-11 rounded-lg border-[#2a2a2a] px-6 text-zinc-300 hover:bg-[#1a1a1a] hover:text-white">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button type="submit" disabled={fetching} className="h-11 rounded-lg bg-orange-500 px-8 font-semibold text-white hover:bg-orange-400 disabled:opacity-50">
                    {fetching ? "Setting up..." : existingBusiness?.id ? "Finish Setup" : "Launch My Workspace"}
                  </Button>
                </div>
              </form>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-orange-500/20 bg-[linear-gradient(180deg,rgba(249,115,22,0.08),rgba(23,23,23,0.95))] p-5 sm:p-6">
                <p className="text-xs uppercase tracking-[0.12em] text-orange-300">First-session win</p>
                <h2 className="mt-3 text-xl font-semibold">You should be able to do something real in the first session</h2>
                <div className="mt-4 space-y-3">
                  {[
                    "Add one client and their vehicle",
                    "Book the first appointment on the calendar",
                    "Generate the first invoice from real work",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                      <p className="text-sm text-[#dbe0e7]">{item}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-[#aab2bf]">
                  Strata will point you to the best next step after setup so you do not land in a blank workspace wondering what to do next.
                </p>
              </div>

              <div className="rounded-3xl border border-[#272727] bg-[linear-gradient(180deg,#171717_0%,#111111_100%)] p-5 sm:p-6">
                <h2 className="text-lg font-semibold">What you get immediately</h2>
                <div className="mt-4 space-y-3">
                  {[
                    { icon: CalendarDays, title: "Today-focused calendar", text: "Start booking work without building a system from scratch." },
                    { icon: Users, title: "Client and vehicle CRM", text: "Keep customer history organized from the first job onward." },
                    { icon: Receipt, title: "Quotes and invoices", text: "Send estimates and collect payment with the same workflow." },
                  ].map((item) => (
                    <div key={item.title} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                      <div>
                        <p className="text-sm font-medium text-white">{item.title}</p>
                        <p className="mt-1 text-sm text-[#9ca3af]">{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">You can change all of this later</p>
                  <p className="mt-1 text-sm text-[#9ca3af]">Hours, taxes, booking rules, and contact details all stay editable in settings after setup.</p>
                </div>
              </div>

              {selectedTypeMeta ? (
                <div className="rounded-3xl border border-[#272727] bg-[#131313] p-5 sm:p-6">
                  <p className="text-xs uppercase tracking-[0.12em] text-[#7c8594]">Recommended defaults</p>
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#9ca3af]">Default team size</span>
                      <span className="font-medium text-white">{staffCount || selectedTypeMeta.defaultStaffCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#9ca3af]">Default hours</span>
                      <span className="font-medium text-white">{operatingHours.days} {operatingHours.open}-{operatingHours.close}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#9ca3af]">Booking buffer</span>
                      <span className="font-medium text-white">{selectedTypeMeta.appointmentBufferMinutes} min</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#9ca3af]">Workflow</span>
                      <span className="font-medium text-white">{selectedTypeMeta.workflowTitle}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-[#1f1f1f] bg-[#0f0f0f]/95 px-4 py-3 backdrop-blur sm:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-5xl gap-3">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={() => setStep(1)} className="h-11 flex-1 border-[#2a2a2a] text-zinc-300 hover:bg-[#1a1a1a] hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          ) : null}
          {step < 2 ? (
            <Button type="button" onClick={() => (selectedType ? setStep(2) : setValidationError("Please choose the kind of shop you run."))} disabled={!selectedType} className="h-11 flex-1 bg-orange-500 text-white hover:bg-orange-400">
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" form={ONBOARDING_FORM_ID} disabled={fetching} className="h-11 flex-1 bg-orange-500 text-white hover:bg-orange-400">
              {fetching ? "Setting up..." : existingBusiness?.id ? "Finish Setup" : "Launch"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
