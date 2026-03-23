import { useState } from "react";
import { useNavigate } from "react-router";
import { useAction } from "../hooks/useApi";
import { api } from "../api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const businessTypes = [
  { value: "auto_detailing", label: "Auto Detailing", icon: "✨", description: "Premium car cleaning, polishing and paint correction" },
  { value: "mobile_detailing", label: "Mobile Detailing", icon: "🚐", description: "On-location detailing services at the customer's site" },
  { value: "ppf_ceramic", label: "PPF & Ceramic", icon: "🛡️", description: "Paint protection film and ceramic coating installation" },
  { value: "tint_shop", label: "Tint Shop", icon: "🪟", description: "Window tinting for vehicles, homes, and commercial spaces" },
  { value: "mechanic", label: "Mechanic", icon: "🔧", description: "General automotive repair and maintenance services" },
  { value: "tire_shop", label: "Tire Shop", icon: "🔄", description: "Tire sales, mounting, balancing, and alignment" },
  { value: "car_wash", label: "Car Wash", icon: "💧", description: "Automated or hand-wash car cleaning services" },
  { value: "wrap_shop", label: "Wrap Shop", icon: "🎨", description: "Full and partial vehicle wraps and vinyl graphics" },
  { value: "dealership_service", label: "Dealership Service", icon: "🏢", description: "New and used vehicle dealership service department" },
  { value: "other_auto_service", label: "Other Auto Service", icon: "➕", description: "Other automotive services and specialties" },
];

interface FormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
}

function ProgressIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-3 mb-10">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300",
                s < step
                  ? "bg-orange-500 text-white"
                  : s === step
                    ? "bg-orange-500 text-white ring-2 ring-orange-500/30 ring-offset-2 ring-offset-[#0f0f0f]"
                    : "bg-[#2a2a2a] text-[#6b7280]"
              )}
            >
              {s < step ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                s
              )}
            </div>
            <span
              className={cn(
                "text-sm font-medium transition-colors duration-300",
                s === step ? "text-white" : "text-[#6b7280]"
              )}
            >
              {s === 1 ? "Business Type" : "Business Details"}
            </span>
          </div>
          {s < 2 && (
            <div
              className={cn(
                "h-px w-12 transition-colors duration-300",
                step > 1 ? "bg-orange-500" : "bg-[#2a2a2a]"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [staffCount, setStaffCount] = useState<string>("1");
  const [operatingHours, setOperatingHours] = useState({ open: "09:00", close: "17:00", days: "Mon-Fri" });
  const [formData, setFormData] = useState<FormData>({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    website: "",
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const [{ fetching, error }, createBusiness] = useAction(api.business.create);

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
    } else if (step === 2) {
      const num = parseInt(staffCount, 10);
      if (isNaN(num) || num < 0) {
        setValidationError("Please enter a valid number of staff (0 or more).");
        return;
      }
      setValidationError(null);
      setStep(3);
    }
  };

  const handleBack = () => {
    setStep((s) => Math.max(1, s - 1));
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    if (!formData.name.trim()) {
      setValidationError("Business name is required.");
      return;
    }
    setValidationError(null);

    const staffNum = parseInt(staffCount, 10);
    const hoursStr = `${operatingHours.days} ${operatingHours.open}-${operatingHours.close}`;

    const result = await createBusiness({
      name: formData.name,
      type: selectedType as any,
      phone: formData.phone || undefined,
      email: formData.email || undefined,
      address: formData.address || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      zip: formData.zip || undefined,
      staffCount: isNaN(staffNum) ? undefined : staffNum,
      operatingHours: hoursStr,
    });

    if (result.error) {
      setValidationError(result.error.message ?? "Could not create your business.");
      return;
    }
    const created = result.data as { id?: string } | undefined;
    if (!created?.id) {
      setValidationError("Unexpected response from server.");
      return;
    }
    try {
      await api.business.completeOnboarding(created.id);
      navigate("/signed-in");
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : "Could not finish setup.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      {/* Header */}
      <div className="border-b border-[#1f1f1f]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="text-lg font-bold tracking-tight">Strata</span>
          </div>
          <span className="text-sm text-[#6b7280]">Setting up your workspace</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Progress */}
        <ProgressIndicator step={step} />

        {/* Step 1 – Business Type */}
        {step === 1 && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 leading-tight">
                What type of business<br className="hidden sm:block" /> are you running?
              </h1>
              <p className="text-[#9ca3af] text-base sm:text-lg">
                Select the option that best describes your shop — you can update this later.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
              {businessTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => {
                    setSelectedType(type.value);
                    if (validationError) setValidationError(null);
                  }}
                  className={cn(
                    "group relative flex flex-col items-start gap-3 rounded-xl border p-4 sm:p-5 text-left transition-all duration-200 cursor-pointer",
                    "hover:border-orange-500/60 hover:bg-[#1f1a16]",
                    selectedType === type.value
                      ? "border-orange-500 bg-[#1f1a16] shadow-lg shadow-orange-500/10"
                      : "border-[#2a2a2a] bg-[#141414]"
                  )}
                >
                  {/* Selection indicator */}
                  {selectedType === type.value && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5l2.5 2.5L8.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}

                  <span
                    className={cn(
                      "text-3xl sm:text-4xl transition-transform duration-200",
                      "group-hover:scale-110",
                      selectedType === type.value && "scale-110"
                    )}
                    role="img"
                    aria-label={type.label}
                  >
                    {type.icon}
                  </span>

                  <div>
                    <p
                      className={cn(
                        "font-semibold text-sm sm:text-base leading-tight mb-1 transition-colors",
                        selectedType === type.value ? "text-orange-400" : "text-white"
                      )}
                    >
                      {type.label}
                    </p>
                    <p className="text-xs sm:text-sm text-[#6b7280] leading-snug line-clamp-2">
                      {type.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {validationError && (
              <p className="text-red-400 text-sm mb-4">{validationError}</p>
            )}

            <Button
              onClick={handleNext}
              size="lg"
              className="bg-orange-500 hover:bg-orange-400 text-white font-semibold px-8 py-3 rounded-lg transition-all duration-200 text-base shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedType}
            >
              Continue
              <svg className="ml-2 w-4 h-4" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          </div>
        )}

        {/* Step 2 – Staff & Operating Hours */}
        {step === 2 && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 leading-tight">
                Staff and operating hours
              </h1>
              <p className="text-[#9ca3af] text-base sm:text-lg">
                This helps us tailor your dashboard and features (e.g. route planner for mobile teams).
              </p>
            </div>

            {selectedType && (
              <div className="inline-flex items-center gap-2 bg-[#1f1a16] border border-orange-500/30 rounded-full px-4 py-1.5 mb-6">
                <span className="text-lg">{businessTypes.find((t) => t.value === selectedType)?.icon}</span>
                <span className="text-sm font-medium text-orange-400">
                  {businessTypes.find((t) => t.value === selectedType)?.label}
                </span>
              </div>
            )}

            <div className="max-w-2xl space-y-6 mb-8">
              <div className="space-y-1.5">
                <Label htmlFor="staffCount" className="text-sm font-medium text-[#d1d5db]">
                  Number of staff
                </Label>
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
                  className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#4b5563] focus:border-orange-500 h-11 rounded-lg w-32"
                />
                <p className="text-xs text-[#6b7280]">Include yourself. You can change this in settings.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[#d1d5db]">Typical operating hours</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    value={operatingHours.days}
                    onChange={(e) => setOperatingHours((h) => ({ ...h, days: e.target.value }))}
                    placeholder="Mon-Fri"
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white w-28 rounded-lg h-11"
                  />
                  <Input
                    type="time"
                    value={operatingHours.open}
                    onChange={(e) => setOperatingHours((h) => ({ ...h, open: e.target.value }))}
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-lg h-11"
                  />
                  <span className="text-[#6b7280]">to</span>
                  <Input
                    type="time"
                    value={operatingHours.close}
                    onChange={(e) => setOperatingHours((h) => ({ ...h, close: e.target.value }))}
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-lg h-11"
                  />
                </div>
                <p className="text-xs text-[#6b7280]">Used for reminders and automation timing.</p>
              </div>
            </div>

            {validationError && <p className="text-red-400 text-sm mb-4">{validationError}</p>}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className="border-[#2a2a2a] text-zinc-300 hover:bg-[#1a1a1a] hover:text-white h-11 px-6 rounded-lg"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleNext}
                size="lg"
                className="bg-orange-500 hover:bg-orange-400 text-white font-semibold px-8 py-3 rounded-lg"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 – Business Details */}
        {step === 3 && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 leading-tight">
                Tell us about your business
              </h1>
              <p className="text-[#9ca3af] text-base sm:text-lg">
                Fill in your business details. You can update these any time from settings.
              </p>
            </div>

            {/* Selected type badge */}
            {selectedType && (
              <div className="inline-flex items-center gap-2 bg-[#1f1a16] border border-orange-500/30 rounded-full px-4 py-1.5 mb-8">
                <span className="text-lg">
                  {businessTypes.find((t) => t.value === selectedType)?.icon}
                </span>
                <span className="text-sm font-medium text-orange-400">
                  {businessTypes.find((t) => t.value === selectedType)?.label}
                </span>
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-[#6b7280] hover:text-white ml-1 text-xs transition-colors"
                >
                  Change
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="max-w-2xl">
              <div className="space-y-5">
                {/* Business Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium text-[#d1d5db]">
                    Business Name <span className="text-orange-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={handleFieldChange("name")}
                    placeholder="e.g. Elite Auto Detailing"
                    required
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#4b5563] focus:border-orange-500 focus:ring-orange-500/20 h-11 rounded-lg"
                  />
                </div>

                {/* Phone & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-sm font-medium text-[#d1d5db]">
                      Phone
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleFieldChange("phone")}
                      placeholder="(555) 000-0000"
                      className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#4b5563] focus:border-orange-500 focus:ring-orange-500/20 h-11 rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium text-[#d1d5db]">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={handleFieldChange("email")}
                      placeholder="hello@yourbusiness.com"
                      className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#4b5563] focus:border-orange-500 focus:ring-orange-500/20 h-11 rounded-lg"
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-sm font-medium text-[#d1d5db]">
                    Street Address
                  </Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={handleFieldChange("address")}
                    placeholder="123 Main St"
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#4b5563] focus:border-orange-500 focus:ring-orange-500/20 h-11 rounded-lg"
                  />
                </div>

                {/* City, State, Zip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-1 space-y-1.5">
                    <Label htmlFor="city" className="text-sm font-medium text-[#d1d5db]">
                      City
                    </Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={handleFieldChange("city")}
                      placeholder="Los Angeles"
                      className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#4b5563] focus:border-orange-500 focus:ring-orange-500/20 h-11 rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state" className="text-sm font-medium text-[#d1d5db]">
                      State
                    </Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={handleFieldChange("state")}
                      placeholder="CA"
                      maxLength={2}
                      className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#4b5563] focus:border-orange-500 focus:ring-orange-500/20 h-11 rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="zip" className="text-sm font-medium text-[#d1d5db]">
                      Zip
                    </Label>
                    <Input
                      id="zip"
                      value={formData.zip}
                      onChange={handleFieldChange("zip")}
                      placeholder="90210"
                      className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#4b5563] focus:border-orange-500 focus:ring-orange-500/20 h-11 rounded-lg"
                    />
                  </div>
                </div>

                {/* Website */}
                <div className="space-y-1.5">
                  <Label htmlFor="website" className="text-sm font-medium text-[#d1d5db]">
                    Website <span className="text-[#6b7280] font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="website"
                    type="url"
                    value={formData.website}
                    onChange={handleFieldChange("website")}
                    placeholder="https://yourbusiness.com"
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#4b5563] focus:border-orange-500 focus:ring-orange-500/20 h-11 rounded-lg"
                  />
                </div>

                {validationError && (
                  <p className="text-red-400 text-sm">{validationError}</p>
                )}

                {error && (
                  <p className="text-red-400 text-sm">{error.message}</p>
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    className="border-[#2a2a2a] text-zinc-300 hover:bg-[#1a1a1a] hover:text-white h-11 px-6 rounded-lg"
                  >
                    <svg className="mr-2 w-4 h-4" viewBox="0 0 16 16" fill="none">
                      <path d="M13 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={fetching}
                    className="bg-orange-500 hover:bg-orange-400 text-white font-semibold h-11 px-8 rounded-lg shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {fetching ? "Setting up..." : "Launch My Shop"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}