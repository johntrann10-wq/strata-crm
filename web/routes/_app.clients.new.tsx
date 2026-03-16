import { useState, useEffect } from "react";
import { useNavigate, useOutletContext, Link } from "react-router";
import { useFindFirst, useAction } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";

const SOURCE_OPTIONS = [
  { value: "walk-in", label: "Walk-in" },
  { value: "referral", label: "Referral" },
  { value: "google", label: "Google" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
];

const TAG_OPTIONS = [
  { value: "vip", label: "VIP" },
  { value: "fleet", label: "Fleet" },
  { value: "wholesale", label: "Wholesale" },
  { value: "retail", label: "Retail" },
];

const PREFERRED_CONTACT_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "sms", label: "SMS" },
];

interface FormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  source: string;
  tags: string[];
  preferredContact: string;
  marketingOptIn: boolean;
  internalNotes: string;
}

export default function NewClientPage() {
  const { user } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();

  const [{ data: business, fetching: businessFetching }] = useFindFirst(api.business, {
    select: { id: true },
  });

  const [{ data, fetching, error }, createClient] = useAction(api.client.create);

  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    source: "",
    tags: [],
    preferredContact: "email",
    marketingOptIn: true,
    internalNotes: "",
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data?.id) {
      navigate(`/clients/${data.id}`);
    }
  }, [data, navigate]);

  const getFieldError = (fieldName: string): string | undefined => {
    if (localErrors[fieldName]) return localErrors[fieldName];
    if (error) {
      const anyError = error as any;
      if (anyError.validationErrors) {
        const ve = anyError.validationErrors.find(
          (e: any) => e.apiIdentifier === fieldName
        );
        if (ve) return ve.message;
      }
    }
    return undefined;
  };

  const handleTagChange = (tag: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      tags: checked ? [...prev.tags, tag] : prev.tags.filter((t) => t !== tag),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (!formData.firstName.trim()) errors.firstName = "First name is required";
    if (!formData.lastName.trim()) errors.lastName = "Last name is required";

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      return;
    }
    setLocalErrors({});

    if (!business?.id) {
      setLocalErrors({ general: "Business profile not loaded. Please refresh and try again." });
      return;
    }

    await createClient({
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      ...(formData.phone ? { phone: formData.phone } : {}),
      ...(formData.email ? { email: formData.email } : {}),
      ...(formData.address ? { address: formData.address } : {}),
      ...(formData.city ? { city: formData.city } : {}),
      ...(formData.state ? { state: formData.state } : {}),
      ...(formData.zip ? { zip: formData.zip } : {}),
      ...(formData.source ? { source: formData.source as any } : {}),
      ...(formData.tags.length > 0 ? { tags: formData.tags as any } : {}),
      preferredContact: formData.preferredContact as any,
      marketingOptIn: formData.marketingOptIn,
      ...(formData.internalNotes ? { internalNotes: formData.internalNotes } : {}),
      business: { _link: business!.id },
    });
  };

  const generalError =
    error && !(error as any).validationErrors
      ? (error as any).message ?? "An error occurred. Please try again."
      : null;

  if (businessFetching) {
    return (
      <div className="max-w-2xl mx-auto p-6 pb-12 flex items-center justify-center min-h-40">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!business?.id) {
    return (
      <div className="max-w-2xl mx-auto p-6 pb-12">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load your business profile. Please try refreshing the page.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 pb-12">
      {/* Back button */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/clients" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Clients
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">New Client</h1>
        <p className="text-muted-foreground mt-1">Add a new client to your business</p>
      </div>

      {/* General error */}
      {localErrors.general && (
        <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {localErrors.general}
        </div>
      )}
      {generalError && (
        <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {generalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">
              First Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="firstName"
              value={formData.firstName}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, firstName: e.target.value }))
              }
              placeholder="Jane"
              aria-invalid={!!getFieldError("firstName")}
            />
            {getFieldError("firstName") && (
              <p className="text-sm text-destructive">{getFieldError("firstName")}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">
              Last Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lastName"
              value={formData.lastName}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, lastName: e.target.value }))
              }
              placeholder="Smith"
              aria-invalid={!!getFieldError("lastName")}
            />
            {getFieldError("lastName") && (
              <p className="text-sm text-destructive">{getFieldError("lastName")}</p>
            )}
          </div>
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, phone: e.target.value }))
              }
              placeholder="(555) 000-0000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="jane@example.com"
            />
          </div>
        </div>

        {/* Additional Details toggle */}
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2"
          onClick={() => setShowAdvanced((prev) => !prev)}
        >
          {showAdvanced ? (
            <>
              <ChevronUp className="h-4 w-4" />
              − Hide Details
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              + Additional Details
            </>
          )}
        </button>

        {/* Collapsible advanced fields */}
        {showAdvanced && (
          <div className="space-y-6">
            {/* Source */}
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Select
                value={formData.source}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, source: val }))
                }
              >
                <SelectTrigger id="source">
                  <SelectValue placeholder="How did they find you?" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder="123 Main St"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, city: e.target.value }))
                  }
                  placeholder="Los Angeles"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, state: e.target.value }))
                  }
                  placeholder="CA"
                  maxLength={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zip">Zip</Label>
                <Input
                  id="zip"
                  value={formData.zip}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, zip: e.target.value }))
                  }
                  placeholder="90001"
                />
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-3">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-4">
                {TAG_OPTIONS.map((tag) => (
                  <div key={tag.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`tag-${tag.value}`}
                      checked={formData.tags.includes(tag.value)}
                      onCheckedChange={(checked) =>
                        handleTagChange(tag.value, checked === true)
                      }
                    />
                    <Label
                      htmlFor={`tag-${tag.value}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {tag.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Preferred Contact */}
            <div className="space-y-3">
              <Label>Preferred Contact Method</Label>
              <RadioGroup
                value={formData.preferredContact}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, preferredContact: val }))
                }
                className="flex flex-wrap gap-6"
              >
                {PREFERRED_CONTACT_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2">
                    <RadioGroupItem
                      value={opt.value}
                      id={`contact-${opt.value}`}
                    />
                    <Label
                      htmlFor={`contact-${opt.value}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Marketing Opt-in */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="marketingOptIn"
                checked={formData.marketingOptIn}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({
                    ...prev,
                    marketingOptIn: checked === true,
                  }))
                }
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="marketingOptIn" className="cursor-pointer">
                  Marketing Opt-in
                </Label>
                <p className="text-sm text-muted-foreground">
                  Client agrees to receive marketing communications
                </p>
              </div>
            </div>

            {/* Internal Notes */}
            <div className="space-y-2">
              <Label htmlFor="internalNotes">Internal Notes</Label>
              <Textarea
                id="internalNotes"
                value={formData.internalNotes}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    internalNotes: e.target.value,
                  }))
                }
                placeholder="Private notes visible only to your team..."
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={fetching}>
            {fetching ? "Saving..." : "Create Client"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/clients">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}