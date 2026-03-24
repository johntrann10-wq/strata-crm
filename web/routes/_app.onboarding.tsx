import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useAction, useFindFirst } from "../hooks/useApi";
import { api } from "../api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  CircleDot,
  Droplets,
  PaintBucket,
  Shield,
  Store,
  Truck,
  Wrench,
} from "lucide-react";

const ONBOARDING_FORM_ID = "onboarding-business-form";

const businessTypes = [
  { value: "auto_detailing", label: "Auto Detailing", icon: Droplets, description: "Premium car cleaning, polishing and paint correction" },
  { value: "mobile_detailing", label: "Mobile Detailing", icon: Truck, description: "On-location detailing services at the customer's site" },
  { value: "ppf_ceramic", label: "PPF & Ceramic", icon: Shield, description: "Paint protection film and ceramic coating installation" },
  { value: "tint_shop", label: "Tint Shop", icon: CircleDot, description: "Window tinting for vehicles, homes, and commercial spaces" },
  { value: "mechanic", label: "Mechanic", icon: Wrench, description: "General automotive repair and maintenance services" },
  { value: "tire_shop", label: "Tire Shop", icon: CircleDot, description: "Tire sales, mounting, balancing, and alignment" },
  { value: "car_wash", label: "Car Wash", icon: Droplets, description: "Automated or hand-wash car cleaning services" },
  { value: "wrap_shop", label: "Wrap Shop", icon: PaintBucket, description: "Full and partial vehicle wraps and vinyl graphics" },
  { value: "dealership_service", label: "Dealership Service", icon: Store, description: "New and used vehicle dealership service department" },
  { value: "other_auto_service", label: "Other Auto Service", icon: Wrench, description: "Other automotive services and specialties" },
] as const;

interface FormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProgressIndicator({ step }: { step: number }) {
  const steps = [
    { id: 1, short: "Type", label: "Business type" },
    { id: 2, short: "Ops", label: "Operations" },
    { id: 3, short: "Info", label: "Business info" },
  ];

  return (
    <div className="mb-8 sm:mb-10">
      <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1">
        {steps.map((item, index) => (
          <div key={item.id} className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300",
                  item.id < step
                    ? "bg-orange-500 text-white"
                    : item.id === step
                      ? "bg-orange-500 text-white ring-2 ring-orange-500/30 ring-offset-2 ring-offset-[#0f0f0f]"
                      : "bg-[#2a2a2a] text-[#6b7280]"
                )}
              >
                {item.id < step ? <CheckMark /> : item.id}
              </div>
              <span className={cn("text-xs sm:text-sm font-medium whitespace-nowrap", item.id === step ? "text-white" : "text-[#6b7280]")}>
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </span>
            </div>
            {index < steps.length - 1 ? (
              <div className={cn("h-px w-6 sm:w-12", step > item.id ? "bg-orange-500" : "bg-[#2a2a2a]")} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [staffCount, setStaffCount] = useState("1");
  const [operatingHours, setOperatingHours] = useState({ open: "09:00", close: "17:00", days: "Mon-Fri" });
  const [formData, setFormData] = useState<FormData>({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const [{ data: existingBusiness, fetching: businessLoading }] = useFindFirst(api.business, {
    select: {
      id: true,
      name: true,
      type: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      staffCount: true,
      operatingHours: true,
      onboardingComplete: true,
    },
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

    setSelectedType(existingBusiness.type ?? null);
    setStaffCount(
      typeof existingBusiness.staffCount === "number" && Number.isFinite(existingBusiness.staffCount)
        ? String(existingBusiness.staffCount)
        : "1"
    );
    setFormData({
      name: existingBusiness.name ?? "",
      phone: existingBusiness.phone ?? "",
      email: existingBusiness.email ?? "",
      address: existingBusiness.address ?? "",
      city: existingBusiness.city ?? "",
      state: existingBusiness.state ?? "",
      zip: existingBusiness.zip ?? "",
    });

    const rawHours = typeof existingBusiness.operatingHours === "string" ? existingBusiness.operatingHours : "";
    const match = rawHours.match(/^(.*)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (match) {
      setOperatingHours({ days: match[1], open: match[2], close: match[3] });
    }
  }, [existingBusiness, navigate]);

  const selectedTypeMeta = useMemo(
    () => businessTypes.find((item) => item.value === selectedType) ?? null,
    [selectedType]
  );

  const handleFieldChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (validationError) setValidationError(null);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!selectedType) {
        setValidationError("Please select a business type to continue.");
        return;
      }
      setValidationError(null);
      setStep(2);
      return;
    }

    if (step === 2) {
      const num = parseInt(staffCount, 10);
      if (!Number.isFinite(num) || num < 0) {
        setValidationError("Please enter a valid number of staff.");
        return;
      }
      setValidationError(null);
      setStep(3);
    }
  };

  const handleBack = () => {
    setValidationError(null);
    setStep((current) => Math.max(1, current - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) {
      setValidationError("Please select a business type.");
      setStep(1);
      return;
    }
    if (!formData.name.trim()) {
      setValidationError("Business name is required.");
      return;
    }

    setValidationError(null);
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

    const result = existingBusiness?.id
      ? await updateBusiness({ id: existingBusiness.id, ...payload })
      : await createBusiness(payload);

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
      try {
        await applyBusinessPreset();
      } catch {
        // Starter services are useful, but onboarding should still complete if seeding fails.
      }
      navigate("/signed-in", { replace: true });
    } catch (submitError) {
      setValidationError(submitError instanceof Error ? submitError.message : "Could not finish setup.");
    }
  };

  if (businessLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center px-4">
        <div className="text-sm text-[#9ca3af]">Loading your workspace setup...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="border-b border-[#1f1f1f]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="text-lg font-bold tracking-tight">Strata</span>
          </div>
          <span className="hidden sm:inline text-sm text-[#6b7280]">Setting up your workspace</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-12 pb-28 sm:pb-12">
        <ProgressIndicator step={step} />

        {step === 1 ? (
          <section>
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-4xl font-bold mb-3 leading-tight">What type of business are you running?</h1>
              <p className="text-sm sm:text-lg text-[#9ca3af]">Choose the closest fit. You can update it later in settings.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
              {businessTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => {
                    setSelectedType(type.value);
                    if (validationError) setValidationError(null);
                  }}
                  className={cn(
                    "group relative rounded-xl border p-4 sm:p-5 text-left transition-all duration-200",
                    selectedType === type.value
                      ? "border-orange-500 bg-[#1f1a16] shadow-lg shadow-orange-500/10"
                      : "border-[#2a2a2a] bg-[#141414] hover:border-orange-500/60 hover:bg-[#1f1a16]"
                  )}
                >
                  {selectedType === type.value ? (
                    <div className="absolute right-3 top-3 h-5 w-5 rounded-full bg-orange-500 flex items-center justify-center">
                      <CheckMark />
                    </div>
                  ) : null}
                  <type.icon className="h-8 w-8 text-orange-300 mb-3" />
                  <p className={cn("font-semibold text-sm sm:text-base mb-1", selectedType === type.value ? "text-orange-400" : "text-white")}>
                    {type.label}
                  </p>
                  <p className="text-xs sm:text-sm text-[#6b7280] leading-snug">{type.description}</p>
                </button>
              ))}
            </div>
            {validationError ? <p className="text-red-400 text-sm">{validationError}</p> : null}
          </section>
        ) : null}

        {step === 2 ? (
          <section>
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-4xl font-bold mb-3 leading-tight">Staff and operating hours</h1>
              <p className="text-sm sm:text-lg text-[#9ca3af]">This sets a solid starting point for scheduling and reminders.</p>
            </div>

            {selectedTypeMeta ? (
              <div className="inline-flex items-center gap-2 bg-[#1f1a16] border border-orange-500/30 rounded-full px-4 py-1.5 mb-6">
                <selectedTypeMeta.icon className="h-4 w-4 text-orange-300" />
                <span className="text-sm font-medium text-orange-400">{selectedTypeMeta.label}</span>
              </div>
            ) : null}

            <div className="max-w-2xl space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="staffCount" className="text-sm font-medium text-[#d1d5db]">Number of staff</Label>
                <Input
                  id="staffCount"
                  type="number"
                  min={0}
                  max={500}
                  value={staffCount}
                  onChange={(e) => {
                    setStaffCount(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="1"
                  className="bg-[#1a1a1a] border-[#2a2a2a] text-white h-11 rounded-lg w-full sm:w-32"
                />
                <p className="text-xs text-[#6b7280]">Include yourself. You can change this later.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[#d1d5db]">Typical operating hours</Label>
                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_auto_1fr] gap-3 items-center">
                  <Input
                    value={operatingHours.days}
                    onChange={(e) => setOperatingHours((current) => ({ ...current, days: e.target.value }))}
                    placeholder="Mon-Fri"
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-lg h-11"
                  />
                  <Input
                    type="time"
                    value={operatingHours.open}
                    onChange={(e) => setOperatingHours((current) => ({ ...current, open: e.target.value }))}
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-lg h-11"
                  />
                  <span className="text-[#6b7280] text-center">to</span>
                  <Input
                    type="time"
                    value={operatingHours.close}
                    onChange={(e) => setOperatingHours((current) => ({ ...current, close: e.target.value }))}
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-lg h-11"
                  />
                </div>
              </div>
            </div>
            {validationError ? <p className="text-red-400 text-sm mt-4">{validationError}</p> : null}
          </section>
        ) : null}

        {step === 3 ? (
          <section>
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-4xl font-bold mb-3 leading-tight">Tell us about your business</h1>
              <p className="text-sm sm:text-lg text-[#9ca3af]">These details will flow into your CRM, invoices, and client-facing information.</p>
            </div>

            {selectedTypeMeta ? (
              <div className="inline-flex items-center gap-2 bg-[#1f1a16] border border-orange-500/30 rounded-full px-4 py-1.5 mb-6">
                <selectedTypeMeta.icon className="h-4 w-4 text-orange-300" />
                <span className="text-sm font-medium text-orange-400">{selectedTypeMeta.label}</span>
              </div>
            ) : null}

            <form id={ONBOARDING_FORM_ID} onSubmit={handleSubmit} className="max-w-2xl space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium text-[#d1d5db]">Business Name <span className="text-orange-500">*</span></Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={handleFieldChange("name")}
                  placeholder="e.g. Elite Auto Detailing"
                  required
                  className="bg-[#1a1a1a] border-[#2a2a2a] text-white h-11 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-sm font-medium text-[#d1d5db]">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleFieldChange("phone")}
                    placeholder="(555) 000-0000"
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white h-11 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-[#d1d5db]">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={handleFieldChange("email")}
                    placeholder="hello@yourbusiness.com"
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white h-11 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address" className="text-sm font-medium text-[#d1d5db]">Street Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={handleFieldChange("address")}
                  placeholder="123 Main St"
                  className="bg-[#1a1a1a] border-[#2a2a2a] text-white h-11 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="city" className="text-sm font-medium text-[#d1d5db]">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={handleFieldChange("city")}
                    placeholder="Los Angeles"
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white h-11 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state" className="text-sm font-medium text-[#d1d5db]">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={handleFieldChange("state")}
                    placeholder="CA"
                    maxLength={2}
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white h-11 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zip" className="text-sm font-medium text-[#d1d5db]">Zip</Label>
                  <Input
                    id="zip"
                    value={formData.zip}
                    onChange={handleFieldChange("zip")}
                    placeholder="90210"
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white h-11 rounded-lg"
                  />
                </div>
              </div>

              {validationError ? <p className="text-red-400 text-sm">{validationError}</p> : null}
              {error ? <p className="text-red-400 text-sm">{error.message}</p> : null}

              <div className="hidden sm:flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={handleBack} className="border-[#2a2a2a] text-zinc-300 hover:bg-[#1a1a1a] hover:text-white h-11 px-6 rounded-lg">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button type="submit" disabled={fetching} className="bg-orange-500 hover:bg-orange-400 text-white font-semibold h-11 px-8 rounded-lg shadow-lg shadow-orange-500/20 disabled:opacity-50">
                  {fetching ? "Saving..." : existingBusiness?.id ? "Finish Setup" : "Launch My Shop"}
                </Button>
              </div>
            </form>
          </section>
        ) : null}
      </div>

      <div className="sm:hidden fixed inset-x-0 bottom-0 border-t border-[#1f1f1f] bg-[#0f0f0f]/95 backdrop-blur px-4 py-3">
        <div className="max-w-4xl mx-auto flex gap-3">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={handleBack} className="flex-1 border-[#2a2a2a] text-zinc-300 hover:bg-[#1a1a1a] hover:text-white h-11">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          ) : null}
          {step < 3 ? (
            <Button type="button" onClick={handleNext} disabled={step === 1 && !selectedType} className="flex-1 bg-orange-500 hover:bg-orange-400 text-white h-11">
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" form={ONBOARDING_FORM_ID} disabled={fetching} className="flex-1 bg-orange-500 hover:bg-orange-400 text-white h-11">
              {fetching ? "Saving..." : existingBusiness?.id ? "Finish Setup" : "Launch"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
