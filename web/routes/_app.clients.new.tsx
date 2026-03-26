import { useRef, useState } from "react";
import { useNavigate, Link, useSearchParams, useOutletContext } from "react-router";
import type { FormEvent } from "react";
import { useFindFirst, useAction } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { toast } from "sonner";

interface FormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  marketingOptIn: boolean;
  internalNotes: string;
}

export default function NewClientPage() {
  const navigate = useNavigate();
  const { currentLocationId } = useOutletContext<AuthOutletContext>();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/clients";
  const hasQueueReturn = searchParams.has("from");
  const [submitMode, setSubmitMode] = useState<"client" | "vehicle" | "quote" | "appointment">(() => {
    const next = searchParams.get("next");
    return next === "vehicle" || next === "quote" || next === "appointment" ? next : "client";
  });
  const submitModeRef = useRef<typeof submitMode>(submitMode);

  const [{ data: business, fetching: businessFetching }] = useFindFirst(api.business, {
    select: { id: true },
  });

  const [{ fetching, error }, createClient] = useAction(api.client.create);

  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    marketingOptIn: true,
    internalNotes: "",
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const setSubmitIntent = (mode: typeof submitMode) => {
    submitModeRef.current = mode;
    setSubmitMode(mode);
  };

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const nextMode = submitter?.dataset.submitMode as typeof submitMode | undefined;
    const mode = nextMode ?? submitModeRef.current ?? submitMode;

    const errors: Record<string, string> = {};
    if (!formData.firstName.trim()) errors.firstName = "First name is required";
    if (!formData.lastName.trim()) errors.lastName = "Last name is required";

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      return;
    }
    setLocalErrors({});

    if (!(business as any)?.id) {
      setLocalErrors({ general: "Business profile not loaded. Please refresh and try again." });
      return;
    }

    const result = await createClient({
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      ...(formData.phone.trim() ? { phone: formData.phone.trim() } : {}),
      ...(formData.email.trim() ? { email: formData.email.trim() } : {}),
      ...(formData.address.trim() ? { address: formData.address.trim() } : {}),
      ...(formData.city.trim() ? { city: formData.city.trim() } : {}),
      ...(formData.state.trim() ? { state: formData.state.trim() } : {}),
      ...(formData.zip.trim() ? { zip: formData.zip.trim() } : {}),
      marketingOptIn: formData.marketingOptIn,
      ...(formData.internalNotes.trim() ? { internalNotes: formData.internalNotes.trim() } : {}),
    });

    if (result.error) {
      return;
    }

    const createdClientId = (result.data as any)?.id;
    if (!createdClientId) {
      setLocalErrors({ general: "Client saved but no record ID was returned. Please refresh and check your client list." });
      return;
    }

    toast.success("Client saved");
    if (mode === "vehicle") {
      navigate(`/clients/${createdClientId}/vehicles/new?next=client&from=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (mode === "quote") {
      navigate(`/quotes/new?clientId=${createdClientId}&from=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (mode === "appointment") {
      navigate(
        `/appointments/new?clientId=${createdClientId}${
          currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
        }&from=${encodeURIComponent(returnTo)}`
      );
      return;
    }
    navigate(`/clients/${createdClientId}?from=${encodeURIComponent(returnTo)}`);
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
      {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to clients queue" /> : null}
      {/* Back button */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to={returnTo} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
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
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
          <p className="text-sm font-medium">Lead handoff</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Save the client and continue directly into vehicle intake, quote creation, or appointment booking.
          </p>
        </div>

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
        <div className="flex flex-col gap-3 pt-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button type="submit" variant="outline" disabled={fetching} data-submit-mode="vehicle" onClick={() => setSubmitIntent("vehicle")}>
              {fetching && submitMode === "vehicle" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save and Add Vehicle
            </Button>
            <Button type="submit" variant="outline" disabled={fetching} data-submit-mode="quote" onClick={() => setSubmitIntent("quote")}>
              {fetching && submitMode === "quote" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save and Create Quote
            </Button>
            <Button type="submit" variant="outline" disabled={fetching} data-submit-mode="appointment" onClick={() => setSubmitIntent("appointment")}>
              {fetching && submitMode === "appointment" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save and Book Appointment
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={fetching} data-submit-mode="client" onClick={() => setSubmitIntent("client")}>
              {fetching && submitMode === "client" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Client
            </Button>
          <Button type="button" variant="outline" asChild>
            <Link to={returnTo}>Cancel</Link>
          </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
