import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router";
import type { FormEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  PhoneCall,
  Receipt,
  UserRoundPlus,
} from "lucide-react";
import { useAction, useFindFirst, useFindMany } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../components/shared/PageHeader";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { EmptyState } from "../components/shared/EmptyState";
import { toast } from "sonner";

interface LeadFormData {
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

type SubmitMode = "client" | "vehicle" | "quote" | "appointment";

const QUICK_ACTIONS: Array<{
  mode: SubmitMode;
  label: string;
  icon: typeof CalendarPlus;
  variant: "default" | "outline";
}> = [
  { mode: "appointment", label: "Save and Book Appointment", icon: CalendarPlus, variant: "default" },
  { mode: "quote", label: "Save and Create Quote", icon: Receipt, variant: "outline" },
  { mode: "vehicle", label: "Save and Add Vehicle", icon: ClipboardList, variant: "outline" },
  { mode: "client", label: "Save Lead Only", icon: UserRoundPlus, variant: "outline" },
];

export default function LeadsPage() {
  const navigate = useNavigate();
  const { businessId, currentLocationId } = useOutletContext<AuthOutletContext>();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/signed-in";
  const hasQueueReturn = searchParams.has("from");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [submitMode, setSubmitMode] = useState<SubmitMode>("appointment");
  const submitModeRef = useRef<SubmitMode>("appointment");

  const [{ data: business, fetching: businessFetching }] = useFindFirst(api.business, {
    select: { id: true, name: true },
    pause: !businessId,
  });
  const [{ fetching, error }, createClient] = useAction(api.client.create);
  const [{ data: recentClientsRaw, fetching: recentClientsFetching }] = useFindMany(api.client, {
    first: 6,
    sort: { createdAt: "Descending" },
    pause: !businessId,
  });

  const recentClients = (recentClientsRaw as any[]) ?? [];
  const leadsToday = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return recentClients.filter((client) => new Date(client.createdAt) >= startOfDay).length;
  }, [recentClients]);
  const leadsWithPhone = useMemo(() => recentClients.filter((client) => Boolean(client.phone)).length, [recentClients]);

  const [formData, setFormData] = useState<LeadFormData>({
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

  const setSubmitIntent = (mode: SubmitMode) => {
    submitModeRef.current = mode;
    setSubmitMode(mode);
  };

  const getFieldError = (fieldName: string): string | undefined => {
    if (localErrors[fieldName]) return localErrors[fieldName];
    if (error) {
      const anyError = error as any;
      if (anyError.validationErrors) {
        const validationError = anyError.validationErrors.find((item: any) => item.apiIdentifier === fieldName);
        if (validationError) return validationError.message;
      }
    }
    return undefined;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const nextMode = submitter?.dataset.submitMode as SubmitMode | undefined;
    const mode = nextMode ?? submitModeRef.current ?? submitMode;

    const errors: Record<string, string> = {};
    if (!formData.firstName.trim()) errors.firstName = "First name is required";
    if (!formData.lastName.trim()) errors.lastName = "Last name is required";

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      return;
    }

    if (!(business as any)?.id) {
      setLocalErrors({ general: "Business profile not loaded. Please refresh and try again." });
      return;
    }

    setLocalErrors({});

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

    if (result.error) return;

    const createdClientId = (result.data as any)?.id;
    if (!createdClientId) {
      setLocalErrors({ general: "Lead saved but no record ID was returned. Please refresh and check your client list." });
      return;
    }

    toast.success("Lead captured");

    if (mode === "vehicle") {
      navigate(`/clients/${createdClientId}/vehicles/new?next=appointment&from=${encodeURIComponent("/leads")}`);
      return;
    }
    if (mode === "quote") {
      navigate(`/quotes/new?clientId=${createdClientId}&from=${encodeURIComponent("/leads")}`);
      return;
    }
    if (mode === "appointment") {
      navigate(
        `/appointments/new?clientId=${createdClientId}${
          currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
        }&from=${encodeURIComponent("/leads")}`
      );
      return;
    }

    navigate(`/clients/${createdClientId}?from=${encodeURIComponent("/leads")}`);
  };

  const generalError =
    error && !(error as any).validationErrors
      ? (error as any).message ?? "An error occurred. Please try again."
      : null;

  useEffect(() => {
    if (searchParams.get("quick") === "details") {
      setShowAdvanced(true);
    }
  }, [searchParams]);

  if (businessFetching) {
    return (
      <div className="max-w-6xl mx-auto p-6 pb-12 flex items-center justify-center min-h-40">
        <p className="text-muted-foreground">Loading lead intake...</p>
      </div>
    );
  }

  if (!business?.id) {
    return (
      <div className="max-w-3xl mx-auto p-6 pb-12">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load your business profile. Please try refreshing the page.
        </div>
      </div>
    );
  }

  return (
    <div className="page-content page-section max-w-6xl">
      {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to previous screen" /> : null}

      <PageHeader
        title="Lead Intake"
        subtitle="Capture a caller fast, save them as a client record, and move straight into the next revenue step without bouncing through extra pages."
        backTo={returnTo}
        badge={
          <Badge variant="secondary" className="text-sm font-medium">
            {business.name ?? "Shop"} call flow
          </Badge>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">Leads today</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{leadsToday}</p>
              <p className="mt-1 text-xs text-muted-foreground">Recent captures created since midnight</p>
            </div>
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">Phone coverage</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{leadsWithPhone}</p>
              <p className="mt-1 text-xs text-muted-foreground">Recent leads with a callback number saved</p>
            </div>
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">Best next step</p>
              <p className="mt-3 text-sm font-semibold text-foreground">Book the appointment while they are still on the phone</p>
              <p className="mt-1 text-xs text-muted-foreground">Use vehicle or quote follow-up only when the call needs more intake first.</p>
            </div>
          </section>

          <section className="rounded-[1.4rem] border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-5 rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium">Call-first workflow</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This page saves a real client record immediately so the lead does not get lost. Then you can add a vehicle,
                build a quote, or book the work without retyping anything.
              </p>
            </div>

            {localErrors.general ? (
              <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {localErrors.general}
              </div>
            ) : null}
            {generalError ? (
              <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {generalError}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="leadFirstName">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="leadFirstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))}
                    placeholder="Jane"
                    aria-invalid={!!getFieldError("firstName")}
                  />
                  {getFieldError("firstName") ? <p className="text-sm text-destructive">{getFieldError("firstName")}</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="leadLastName">
                    Last Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="leadLastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Smith"
                    aria-invalid={!!getFieldError("lastName")}
                  />
                  {getFieldError("lastName") ? <p className="text-sm text-destructive">{getFieldError("lastName")}</p> : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="leadPhone">Phone</Label>
                  <Input
                    id="leadPhone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="(555) 000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leadEmail">Email</Label>
                  <Input
                    id="leadEmail"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="jane@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="leadNotes">What do they need?</Label>
                <Textarea
                  id="leadNotes"
                  value={formData.internalNotes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, internalNotes: e.target.value }))}
                  placeholder="PPF front clip on a new Tesla, wants pricing this week. Mentioned afternoon appointment preference."
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">Saved as internal notes so the call context follows the client into the next workflow.</p>
              </div>

              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setShowAdvanced((prev) => !prev)}
              >
                {showAdvanced ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Hide extra details
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Add address, marketing preference, and more
                  </>
                )}
              </button>

              {showAdvanced ? (
                <div className="space-y-6 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="leadAddress">Address</Label>
                    <Input
                      id="leadAddress"
                      value={formData.address}
                      onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                      placeholder="123 Main St"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="leadCity">City</Label>
                      <Input
                        id="leadCity"
                        value={formData.city}
                        onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                        placeholder="Los Angeles"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="leadState">State</Label>
                      <Input
                        id="leadState"
                        value={formData.state}
                        onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
                        placeholder="CA"
                        maxLength={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="leadZip">Zip</Label>
                      <Input
                        id="leadZip"
                        value={formData.zip}
                        onChange={(e) => setFormData((prev) => ({ ...prev, zip: e.target.value }))}
                        placeholder="90001"
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="leadMarketingOptIn"
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
                      <Label htmlFor="leadMarketingOptIn" className="cursor-pointer">
                        Marketing opt-in
                      </Label>
                      <p className="text-sm text-muted-foreground">Keep this checked only if they explicitly agreed to future marketing.</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3 pt-2">
                <div className="grid gap-3 md:grid-cols-2">
                  {QUICK_ACTIONS.map(({ mode, label, icon: Icon, variant }) => (
                    <Button
                      key={mode}
                      type="submit"
                      variant={variant}
                      disabled={fetching}
                      data-submit-mode={mode}
                      onClick={() => setSubmitIntent(mode)}
                      className="justify-start"
                    >
                      {fetching && submitMode === mode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
                      {label}
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="ghost" asChild>
                    <Link to={returnTo}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Cancel
                    </Link>
                  </Button>
                </div>
              </div>
            </form>
          </section>
        </div>

        <div className="space-y-6">
          <section className="surface-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Recent lead captures</p>
                <p className="mt-1 text-sm text-foreground">Use these when someone calls back and you need context fast.</p>
              </div>
              <Badge variant="outline">{recentClients.length}</Badge>
            </div>

            <div className="mt-4 space-y-3">
              {recentClientsFetching ? (
                <p className="text-sm text-muted-foreground">Loading recent captures...</p>
              ) : recentClients.length > 0 ? (
                recentClients.map((client: any) => (
                  <Link
                    key={client.id}
                    to={`/clients/${client.id}?from=${encodeURIComponent("/leads")}`}
                    className="block rounded-xl border border-border/70 bg-background/80 px-4 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {client.firstName} {client.lastName}
                        </p>
                        {client.phone ? <p className="mt-1 text-sm text-muted-foreground">{client.phone}</p> : null}
                        {client.email ? <p className="mt-0.5 text-sm text-muted-foreground">{client.email}</p> : null}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(client.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <EmptyState
                  icon={PhoneCall}
                  title="No leads captured yet"
                  description="Once your first caller is saved here, their record will appear for fast callback and follow-up."
                  className="border-0 bg-transparent p-0 shadow-none"
                />
              )}
            </div>
          </section>

          <section className="surface-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">During the call</p>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <div className="rounded-xl border border-border/70 bg-background/80 px-4 py-3">
                Save the caller first, even if the vehicle details are incomplete.
              </div>
              <div className="rounded-xl border border-border/70 bg-background/80 px-4 py-3">
                Book the appointment on the same call whenever the shop already knows enough to schedule.
              </div>
              <div className="rounded-xl border border-border/70 bg-background/80 px-4 py-3">
                Use quote flow when they need pricing before they commit.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
