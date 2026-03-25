import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useAction, useFindFirst } from "../hooks/useApi";
import { api } from "../api";
import { setCurrentBusinessId } from "../lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
  Receipt,
  Shield,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

const ONBOARDING_FORM_ID = "onboarding-business-form";

type BusinessTypeValue =
  | "auto_detailing"
  | "mobile_detailing"
  | "wrap_ppf"
  | "window_tinting"
  | "performance"
  | "mechanic"
  | "tire_shop"
  | "muffler_shop";

type BusinessTypeMeta = {
  value: BusinessTypeValue;
  label: string;
  icon: typeof Droplets;
  description: string;
  exampleName: string;
  starterCount: number;
  sampleServices: string[];
  defaultStaffCount: string;
  defaultDays: string;
  defaultOpen: string;
  defaultClose: string;
};

const businessTypes: BusinessTypeMeta[] = [
  { value: "auto_detailing", label: "Auto Detailing", icon: Droplets, description: "Premium car cleaning, polishing, and correction services.", exampleName: "Elite Auto Detailing", starterCount: 26, sampleServices: ["Full Detail", "Paint Correction", "Ceramic Coating"], defaultStaffCount: "1", defaultDays: "Mon-Sat", defaultOpen: "08:00", defaultClose: "18:00" },
  { value: "mobile_detailing", label: "Mobile Detailing", icon: Truck, description: "On-site detailing at homes, offices, or fleet locations.", exampleName: "Roadside Detail Co.", starterCount: 25, sampleServices: ["Mobile Full Detail", "Maintenance Wash", "Seat Extraction"], defaultStaffCount: "1", defaultDays: "Mon-Sat", defaultOpen: "08:00", defaultClose: "17:00" },
  { value: "wrap_ppf", label: "Wrap & PPF", icon: Shield, description: "PPF, wraps, trim blackout, and protection work.", exampleName: "Precision Wrap Studio", starterCount: 26, sampleServices: ["Front-End PPF", "Color Change Wrap", "Chrome Delete"], defaultStaffCount: "2", defaultDays: "Mon-Fri", defaultOpen: "09:00", defaultClose: "18:00" },
  { value: "window_tinting", label: "Window Tinting", icon: CircleDot, description: "Automotive tint installs, upgrades, and film replacements.", exampleName: "Clear Shade Tint", starterCount: 26, sampleServices: ["Full Vehicle Tint", "Ceramic Film Tint", "Windshield Tint"], defaultStaffCount: "2", defaultDays: "Mon-Sat", defaultOpen: "09:00", defaultClose: "18:00" },
  { value: "performance", label: "Performance", icon: Gauge, description: "Bolt-ons, suspension, tuning, brakes, and track prep.", exampleName: "Apex Performance Garage", starterCount: 26, sampleServices: ["Coilover Install", "ECU Tune", "Brake Upgrade"], defaultStaffCount: "2", defaultDays: "Mon-Fri", defaultOpen: "09:00", defaultClose: "18:00" },
  { value: "mechanic", label: "Mechanic", icon: Wrench, description: "General repair, maintenance, diagnostics, and inspections.", exampleName: "Main Street Auto Repair", starterCount: 26, sampleServices: ["Synthetic Oil Change", "Brake Service", "Diagnostic"], defaultStaffCount: "2", defaultDays: "Mon-Fri", defaultOpen: "08:00", defaultClose: "17:00" },
  { value: "tire_shop", label: "Tire Shop", icon: CircleDot, description: "Tire mounting, balancing, repair, and alignment.", exampleName: "Fast Lane Tire", starterCount: 25, sampleServices: ["Mount & Balance", "Flat Repair", "Alignment"], defaultStaffCount: "2", defaultDays: "Mon-Sat", defaultOpen: "08:00", defaultClose: "17:00" },
  { value: "muffler_shop", label: "Muffler Shop", icon: Wrench, description: "Exhaust repair, fabrication, upgrades, and sound tuning.", exampleName: "Street Tone Exhaust", starterCount: 26, sampleServices: ["Muffler Replacement", "Custom Exhaust", "Leak Repair"], defaultStaffCount: "2", defaultDays: "Mon-Fri", defaultOpen: "09:00", defaultClose: "17:00" },
];

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
  const [validationError, setValidationError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ name: "", phone: "", email: "", address: "", city: "", state: "", zip: "" });

  const [{ data: existingBusiness, fetching: businessLoading }] = useFindFirst(api.business, {
    select: { id: true, name: true, type: true, phone: true, email: true, address: true, city: true, state: true, zip: true, staffCount: true, operatingHours: true, onboardingComplete: true },
  } as any);
  const [{ fetching: creating, error }, createBusiness] = useAction(api.business.create);
  const [{ fetching: updating }, updateBusiness] = useAction(api.business.update);
  const [{ fetching: applyingPreset }, applyBusinessPreset] = useAction(api.applyBusinessPreset);
  const fetching = creating || updating || applyingPreset;

  useEffect(() => {
    if (!existingBusiness) return;
    if (existingBusiness.onboardingComplete === true) {
      navigate("/signed-in", { replace: true });
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

  const selectedTypeMeta = useMemo(() => businessTypes.find((item) => item.value === selectedType) ?? null, [selectedType]);

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
      setCurrentBusinessId(saved.id);
      await api.business.completeOnboarding(saved.id);
      try {
        const presetResult = await applyBusinessPreset();
        if (presetResult.data && typeof presetResult.data === "object" && "ok" in presetResult.data && presetResult.data.ok === false) {
          toast.warning(presetResult.data.message);
        } else {
          toast.success("Workspace ready. Starter services are loaded.");
        }
      } catch {
        toast.warning("Workspace created. Starter services may still be loading.");
      }
      navigate("/signed-in", { replace: true });
    } catch (submitError) {
      setValidationError(submitError instanceof Error ? submitError.message : "Could not finish setup.");
    }
  };

  if (businessLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4 text-sm text-[#9ca3af]">Loading your workspace setup...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="border-b border-[#1f1f1f]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-sm font-bold text-white">S</div>
            <span className="text-lg font-bold tracking-tight">Strata</span>
          </div>
          <span className="hidden text-sm text-[#6b7280] sm:inline">Get operational in minutes</span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-3 py-4 pb-32 sm:px-6 sm:py-12 sm:pb-12">
        <ProgressIndicator step={step} />

        {step === 1 ? (
          <section className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
            <div>
              <div className="mb-6">
                <h1 className="mb-3 text-2xl font-bold sm:text-4xl">Choose your shop type</h1>
                <p className="text-sm text-[#9ca3af] sm:text-lg">Strata will preload the right starter services, default schedule, and workflow structure for your business.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {businessTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => {
                      setSelectedType(type.value);
                      setValidationError(null);
                    }}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition-all sm:p-5",
                      selectedType === type.value ? "border-orange-500 bg-[#1f1a16] shadow-lg shadow-orange-500/10" : "border-[#2a2a2a] bg-[#141414] hover:border-orange-500/60 hover:bg-[#1a1714]"
                    )}
                  >
                    <type.icon className="mb-3 h-8 w-8 text-orange-300" />
                    <p className={cn("mb-1 text-sm font-semibold sm:text-base", selectedType === type.value ? "text-orange-300" : "text-white")}>{type.label}</p>
                    <p className="text-xs leading-snug text-[#8b929f] sm:text-sm">{type.description}</p>
                  </button>
                ))}
              </div>
              {validationError ? <p className="mt-4 text-sm text-red-400">{validationError}</p> : null}
              <div className="hidden pt-4 sm:flex">
                <Button type="button" onClick={() => (selectedType ? setStep(2) : setValidationError("Please choose the kind of shop you run."))} disabled={!selectedType} className="h-11 rounded-lg bg-orange-500 px-8 font-semibold text-white hover:bg-orange-400">
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-[#272727] bg-[linear-gradient(180deg,#171717_0%,#111111_100%)] p-5 sm:p-6">
              {selectedTypeMeta ? (
                <div className="space-y-5">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-200">
                      <selectedTypeMeta.icon className="h-3.5 w-3.5" />
                      {selectedTypeMeta.label}
                    </div>
                    <h2 className="mt-4 text-xl font-semibold">You will start with a usable workspace</h2>
                    <p className="mt-2 text-sm text-[#9ca3af]">No blank setup. Strata will preload services, a working schedule, and your core operating screens.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-[#7c8594]">Starter services</p>
                      <p className="mt-2 text-2xl font-semibold">{selectedTypeMeta.starterCount}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-[#7c8594]">Default schedule</p>
                      <p className="mt-2 text-lg font-semibold">{selectedTypeMeta.defaultDays}</p>
                      <p className="mt-1 text-sm text-[#9ca3af]">{selectedTypeMeta.defaultOpen}-{selectedTypeMeta.defaultClose}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-[#7c8594]">Starter menu preview</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedTypeMeta.sampleServices.map((service) => (
                        <span key={service} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-white/85">{service}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#2b2b2b] bg-[#121212] p-5 text-sm text-[#8b929f]">Pick a business type to preview the starter workspace.</div>
              )}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="mb-6">
                <h1 className="mb-3 text-2xl font-bold sm:text-4xl">Launch your workspace</h1>
                <p className="text-sm text-[#9ca3af] sm:text-lg">Only your business name is required. Everything else can be refined later from settings.</p>
              </div>

              <form id={ONBOARDING_FORM_ID} onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-[#232323] bg-[#141414] p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-sm font-medium text-[#d1d5db]">Business name <span className="text-orange-500">*</span></Label>
                    <Input id="name" value={formData.name} onChange={handleFieldChange("name")} placeholder={selectedTypeMeta?.exampleName ?? "Your business name"} required className="h-11 rounded-lg border-[#2a2a2a] bg-[#1a1a1a] text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-[#d1d5db]">Business type</Label>
                    <div className="flex h-11 items-center rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 text-sm text-white">{selectedTypeMeta?.label ?? "Not selected"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-sm font-medium text-[#d1d5db]">Phone</Label>
                    <Input id="phone" type="tel" value={formData.phone} onChange={handleFieldChange("phone")} placeholder="(555) 000-0000" className="h-11 rounded-lg border-[#2a2a2a] bg-[#1a1a1a] text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium text-[#d1d5db]">Email</Label>
                    <Input id="email" type="email" value={formData.email} onChange={handleFieldChange("email")} placeholder="hello@yourbusiness.com" className="h-11 rounded-lg border-[#2a2a2a] bg-[#1a1a1a] text-white" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-sm font-medium text-[#d1d5db]">Address</Label>
                  <Input id="address" value={formData.address} onChange={handleFieldChange("address")} placeholder="123 Main St" className="h-11 rounded-lg border-[#2a2a2a] bg-[#1a1a1a] text-white" />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="city" className="text-sm font-medium text-[#d1d5db]">City</Label>
                    <Input id="city" value={formData.city} onChange={handleFieldChange("city")} placeholder="Los Angeles" className="h-11 rounded-lg border-[#2a2a2a] bg-[#1a1a1a] text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state" className="text-sm font-medium text-[#d1d5db]">State</Label>
                    <Input id="state" value={formData.state} onChange={handleFieldChange("state")} placeholder="CA" maxLength={2} className="h-11 rounded-lg border-[#2a2a2a] bg-[#1a1a1a] text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="zip" className="text-sm font-medium text-[#d1d5db]">Zip</Label>
                    <Input id="zip" value={formData.zip} onChange={handleFieldChange("zip")} placeholder="90210" className="h-11 rounded-lg border-[#2a2a2a] bg-[#1a1a1a] text-white" />
                  </div>
                </div>

                <div className="rounded-2xl border border-[#262626] bg-[#111111]">
                  <button type="button" onClick={() => setShowAdvanced((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                    <div>
                      <p className="text-sm font-medium text-white">Advanced startup defaults</p>
                      <p className="mt-1 text-xs text-[#8b929f]">Team size and hours are already prefilled for your shop type.</p>
                    </div>
                    {showAdvanced ? <ChevronUp className="h-4 w-4 text-[#8b929f]" /> : <ChevronDown className="h-4 w-4 text-[#8b929f]" />}
                  </button>
                  {showAdvanced ? (
                    <div className="space-y-4 border-t border-[#262626] px-4 pb-4 pt-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="staffCount" className="text-sm font-medium text-[#d1d5db]">Number of staff</Label>
                        <Input id="staffCount" type="number" min={0} max={500} value={staffCount} onChange={(e) => setStaffCount(e.target.value)} className="h-11 w-full rounded-lg border-[#2a2a2a] bg-[#1a1a1a] text-white sm:w-32" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-[#d1d5db]">Typical operating hours</Label>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr_auto_1fr] sm:items-center">
                          <Input value={operatingHours.days} onChange={(e) => setOperatingHours((current) => ({ ...current, days: e.target.value }))} className="h-11 rounded-lg border-[#2a2a2a] bg-[#1a1a1a] text-white" />
                          <Input type="time" value={operatingHours.open} onChange={(e) => setOperatingHours((current) => ({ ...current, open: e.target.value }))} className="h-11 rounded-lg border-[#2a2a2a] bg-[#1a1a1a] text-white" />
                          <span className="text-center text-[#6b7280]">to</span>
                          <Input type="time" value={operatingHours.close} onChange={(e) => setOperatingHours((current) => ({ ...current, close: e.target.value }))} className="h-11 rounded-lg border-[#2a2a2a] bg-[#1a1a1a] text-white" />
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
              </div>

              {selectedTypeMeta ? (
                <div className="rounded-3xl border border-[#272727] bg-[#131313] p-5 sm:p-6">
                  <p className="text-xs uppercase tracking-[0.12em] text-[#7c8594]">Recommended defaults</p>
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#9ca3af]">Starter services</span>
                      <span className="font-medium text-white">{selectedTypeMeta.starterCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#9ca3af]">Default team size</span>
                      <span className="font-medium text-white">{staffCount || selectedTypeMeta.defaultStaffCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#9ca3af]">Default hours</span>
                      <span className="font-medium text-white">{operatingHours.days} {operatingHours.open}-{operatingHours.close}</span>
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
