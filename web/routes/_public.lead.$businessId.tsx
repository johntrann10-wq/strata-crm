import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useSearchParams } from "react-router";
import { API_BASE } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getPhoneNumberInputError } from "@/lib/phone";
import {
  resolvePublicShareMetadata,
  usePublicShareMeta,
  type PublicShareMetadataPayload,
} from "@/lib/publicShareMeta";
import { CheckCircle2, Clock3, Loader2, MessageSquareMore, ShieldCheck } from "lucide-react";

type LeadConfig = {
  businessId: string;
  businessName: string;
  businessType: string;
  timezone: string;
  leadCaptureEnabled: boolean;
};

type LeadFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  vehicle: string;
  serviceInterest: string;
  summary: string;
  marketingOptIn: boolean;
  website: string;
};

function emptyForm(): LeadFormState {
  return {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    vehicle: "",
    serviceInterest: "",
    summary: "",
    marketingOptIn: true,
    website: "",
  };
}

function buildApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

const publicSiteUrl = "https://stratacrm.app";

export function meta({ params }: { params: { businessId?: string } }) {
  const businessId = params.businessId?.trim();
  const previewUrl = businessId
    ? `${publicSiteUrl}/api/businesses/${encodeURIComponent(businessId)}/public-brand-image`
    : `${publicSiteUrl}/social-preview.png?v=20260416c`;
  const canonicalUrl = businessId
    ? `${publicSiteUrl}/lead/${encodeURIComponent(businessId)}`
    : `${publicSiteUrl}/lead`;
  const title = "Request service | Strata";
  const description = "Share a few details so the shop can reach out with the right next step.";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:url", content: canonicalUrl },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: previewUrl },
    { property: "og:image:secure_url", content: previewUrl },
    { property: "og:image:alt", content: "Service request page preview" },
    { name: "twitter:url", content: canonicalUrl },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: previewUrl },
    { name: "twitter:image:alt", content: "Service request page preview" },
  ];
}

export default function PublicLeadCapturePage() {
  const { businessId } = useParams();
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<LeadConfig | null>(null);
  const [shareMetadataPayload, setShareMetadataPayload] = useState<PublicShareMetadataPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<LeadFormState>(emptyForm);

  useEffect(() => {
    if (!businessId) {
      setError("This request form link is invalid.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(buildApiUrl(`/api/businesses/${encodeURIComponent(businessId)}/public-lead-config`))
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(payload.message || "This request form is unavailable right now.");
        }
        return response.json() as Promise<LeadConfig>;
      })
      .then((payload) => {
        if (!cancelled) setConfig(payload);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "This request form is unavailable right now.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const source = useMemo(
    () => searchParams.get("source") || searchParams.get("utm_source") || searchParams.get("ref") || "website",
    [searchParams]
  );
  const campaign = useMemo(() => searchParams.get("campaign") || searchParams.get("utm_campaign") || "", [searchParams]);
  const resolvedShareMetadata = useMemo(() => {
    if (typeof window === "undefined" || !shareMetadataPayload) return null;
    return resolvePublicShareMetadata(shareMetadataPayload, window.location.origin, window.location.search);
  }, [shareMetadataPayload]);

  usePublicShareMeta(resolvedShareMetadata);

  useEffect(() => {
    if (!businessId) {
      setShareMetadataPayload(null);
      return;
    }

    let cancelled = false;

    fetch(buildApiUrl(`/api/businesses/${encodeURIComponent(businessId)}/public-lead-share-metadata`))
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as PublicShareMetadataPayload & { message?: string };
        if (!response.ok) throw new Error(payload.message || "Could not load share metadata.");
        return payload;
      })
      .then((payload) => {
        if (!cancelled) setShareMetadataPayload(payload);
      })
      .catch(() => {
        if (!cancelled) setShareMetadataPayload(null);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!businessId) return;
    const phoneError = getPhoneNumberInputError(form.phone);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl(`/api/businesses/${encodeURIComponent(businessId)}/public-leads`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          source,
          campaign,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Could not submit your request.");
      }
      setSubmitted(true);
      setForm(emptyForm());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit your request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.06),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_44%,#f8fafc_100%)]">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="space-y-6 sm:space-y-7">
          <header className="space-y-4 text-center sm:space-y-5 sm:text-left">
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[0.68rem] uppercase tracking-[0.18em] shadow-sm">
              Service Request
            </Badge>
            <div className="space-y-2.5">
              <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.65rem] sm:leading-[1.02]">
                Tell us what you need
              </h1>
              <p className="max-w-xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
                Share a few details and the shop can follow up with the right next step.
              </p>
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-slate-500">
                {loading ? "Preparing your request form" : `For ${config?.businessName ?? "the shop"}`}
              </p>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: MessageSquareMore,
                title: "Goes directly to the shop",
                body: "Sent straight to the team.",
              },
              {
                icon: Clock3,
                title: "Quick follow-up",
                body: "A fast way to get a response.",
              },
              {
                icon: ShieldCheck,
                title: "Secure and simple",
                body: "Share only what they need.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-[1.2rem] border border-white/80 bg-white/80 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.045)] backdrop-blur-sm"
                >
                  <div className="rounded-xl bg-orange-50 p-2.5 text-orange-600 ring-1 ring-orange-100">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tracking-[-0.01em] text-slate-950">{item.title}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="overflow-hidden border-slate-200/85 bg-white/96 shadow-[0_26px_70px_rgba(15,23,42,0.08),0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="h-1.5 w-full bg-[linear-gradient(90deg,rgba(249,115,22,0.95),rgba(251,146,60,0.88),rgba(15,23,42,0.9))]" />
            <CardHeader className="space-y-2.5 border-b border-slate-100/90 pb-5 sm:pb-6">
              <CardTitle className="text-[1.45rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[1.65rem]">Your details</CardTitle>
              <CardDescription className="max-w-lg text-sm leading-6 text-slate-600">
                Usually takes about a minute.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 sm:pt-6">
              {loading ? (
                <div className="flex items-center gap-3 rounded-[1.15rem] border border-dashed border-slate-300/90 bg-slate-50/80 px-4 py-6 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading request form...
                </div>
              ) : error && !submitted ? (
                <div className="space-y-4 rounded-[1.2rem] border border-rose-200 bg-rose-50 px-5 py-5 text-sm text-rose-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                  <div className="space-y-1">
                    <p className="font-semibold text-rose-950">This request form is unavailable right now.</p>
                    <p>{error}</p>
                  </div>
                  <Button asChild variant="outline">
                    <a href="/">Back to Strata</a>
                  </Button>
                </div>
              ) : submitted ? (
                <div className="space-y-5 rounded-[1.35rem] border border-emerald-200 bg-[linear-gradient(180deg,#f0fdf4_0%,#ecfdf3_100%)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-emerald-100 p-2.5 text-emerald-700">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-emerald-950">Request sent</p>
                      <p className="text-sm leading-6 text-emerald-900">
                        {config?.businessName ?? "The shop"} has your details and can follow up soon.
                      </p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setSubmitted(false)}>
                    Submit another request
                  </Button>
                </div>
              ) : (
                <form className="space-y-6" onSubmit={handleSubmit}>
                  <input
                    type="text"
                    name="website"
                    value={form.website}
                    onChange={(e) => setForm((current) => ({ ...current, website: e.target.value }))}
                    className="hidden"
                    tabIndex={-1}
                    autoComplete="off"
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="lead-first-name">First name</Label>
                      <Input
                        id="lead-first-name"
                        value={form.firstName}
                        onChange={(e) => setForm((current) => ({ ...current, firstName: e.target.value }))}
                        placeholder="Jamie"
                        className="h-11 rounded-2xl bg-slate-50/60 px-4 shadow-none focus-visible:bg-white"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lead-last-name">Last name</Label>
                      <Input
                        id="lead-last-name"
                        value={form.lastName}
                        onChange={(e) => setForm((current) => ({ ...current, lastName: e.target.value }))}
                        placeholder="Rivera"
                        className="h-11 rounded-2xl bg-slate-50/60 px-4 shadow-none focus-visible:bg-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="lead-email">Email address</Label>
                      <Input
                        id="lead-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                        placeholder="you@example.com"
                        className="h-11 rounded-2xl bg-slate-50/60 px-4 shadow-none focus-visible:bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lead-phone">Best phone number</Label>
                      <PhoneInput
                        id="lead-phone"
                        value={form.phone}
                        onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
                        placeholder="(555) 111-2222"
                        className="h-11 rounded-2xl bg-slate-50/60 px-4 shadow-none focus-visible:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="lead-vehicle">Vehicle</Label>
                      <Input
                        id="lead-vehicle"
                        value={form.vehicle}
                        onChange={(e) => setForm((current) => ({ ...current, vehicle: e.target.value }))}
                        placeholder="2022 BMW X5"
                        className="h-11 rounded-2xl bg-slate-50/60 px-4 shadow-none focus-visible:bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lead-service">Service needed</Label>
                      <Input
                        id="lead-service"
                        value={form.serviceInterest}
                        onChange={(e) => setForm((current) => ({ ...current, serviceInterest: e.target.value }))}
                        placeholder="Paint correction"
                        className="h-11 rounded-2xl bg-slate-50/60 px-4 shadow-none focus-visible:bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lead-summary">Additional details</Label>
                    <Textarea
                      id="lead-summary"
                      value={form.summary}
                      onChange={(e) => setForm((current) => ({ ...current, summary: e.target.value }))}
                      rows={5}
                      className="min-h-[132px] resize-none rounded-2xl bg-slate-50/60 px-4 py-3.5 shadow-none focus-visible:bg-white"
                      placeholder="Timing, questions, or anything the shop should know."
                    />
                    <p className="text-xs leading-5 text-slate-500">
                      Add timing, questions, or anything the shop should know.
                    </p>
                  </div>

                  <div className="flex items-start gap-3 rounded-[1.2rem] border border-slate-200 bg-slate-50/85 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                    <Checkbox
                      id="lead-marketing-opt-in"
                      checked={form.marketingOptIn}
                      onCheckedChange={(checked) => setForm((current) => ({ ...current, marketingOptIn: checked === true }))}
                      className="mt-0.5"
                    />
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-marketing-opt-in" className="cursor-pointer text-sm font-medium text-slate-950">
                        It&apos;s okay for this shop to follow up with me
                      </Label>
                      <p className="text-xs leading-5 text-slate-600">
                        This allows the shop to follow up about your request and related service updates.
                      </p>
                    </div>
                  </div>

                  {error ? (
                    <div className="rounded-[1.15rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                      {error}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-slate-500">
                      The shop can follow up by email or phone.
                    </p>
                    <Button
                      type="submit"
                      className="h-11 w-full min-w-[180px] rounded-2xl px-5 text-sm font-semibold shadow-[0_14px_30px_rgba(249,115,22,0.2)] sm:w-auto"
                      disabled={submitting}
                    >
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {submitting ? "Sending request..." : "Send request"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
