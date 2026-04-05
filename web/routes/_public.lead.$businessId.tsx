import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck } from "lucide-react";

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

export function meta() {
  return [
    { title: "Request service | Strata" },
    { name: "description", content: "Send your service request and let the shop follow up quickly." },
  ];
}

export default function PublicLeadCapturePage() {
  const { businessId } = useParams();
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<LeadConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<LeadFormState>(emptyForm);

  useEffect(() => {
    if (!businessId) {
      setError("This lead form link is invalid.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/businesses/${encodeURIComponent(businessId)}/public-lead-config`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(payload.message || "This lead form is unavailable right now.");
        }
        return response.json() as Promise<LeadConfig>;
      })
      .then((payload) => {
        if (!cancelled) setConfig(payload);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : "This lead form is unavailable right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const source = useMemo(
    () =>
      searchParams.get("source") ||
      searchParams.get("utm_source") ||
      searchParams.get("ref") ||
      "website",
    [searchParams]
  );
  const campaign = useMemo(
    () => searchParams.get("campaign") || searchParams.get("utm_campaign") || "",
    [searchParams]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!businessId) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/public-leads`, {
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.18),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card className="border-slate-200/80 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardHeader className="space-y-4">
              <Badge variant="secondary" className="w-fit">New service request</Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  {loading ? "Loading request form..." : `Reach ${config?.businessName ?? "the shop"} fast`}
                </h1>
                <p className="max-w-xl text-sm leading-6 text-slate-600">
                  Share the basics and the shop can follow up with the right next step instead of starting from scratch.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-900">Built for quick follow-through</p>
                    <p className="text-sm text-slate-600">
                      Your request lands directly in the shop&apos;s lead queue so they can call, quote, or book without retyping your information.
                    </p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-600">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-slate-900">What to include</p>
                <p className="mt-1">The best requests usually include your contact method, vehicle if known, and what you are trying to get done.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-slate-900">Source tracking</p>
                <p className="mt-1">
                  This form keeps the shop&apos;s source attribution intact for reporting and follow-up.
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {source}
                  {campaign ? ` • ${campaign}` : ""}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.1)]">
            <CardHeader>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Tell the shop what you need</h2>
              <p className="text-sm text-slate-600">
                This should only take a minute.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-6 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading lead form...
                </div>
              ) : error && !submitted ? (
                <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
                  <p>{error}</p>
                  <Button asChild variant="outline">
                    <Link to="/">Back to Strata</Link>
                  </Button>
                </div>
              ) : submitted ? (
                <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
                    <div>
                      <p className="text-base font-semibold text-emerald-950">Request received</p>
                      <p className="mt-1 text-sm text-emerald-900">
                        {config?.businessName ?? "The shop"} now has your information and can follow up from their lead queue.
                      </p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setSubmitted(false)}>
                    Submit another request
                  </Button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <input type="text" name="website" value={form.website} onChange={(e) => setForm((current) => ({ ...current, website: e.target.value }))} className="hidden" tabIndex={-1} autoComplete="off" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-first-name">First name</Label>
                      <Input id="lead-first-name" value={form.firstName} onChange={(e) => setForm((current) => ({ ...current, firstName: e.target.value }))} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-last-name">Last name</Label>
                      <Input id="lead-last-name" value={form.lastName} onChange={(e) => setForm((current) => ({ ...current, lastName: e.target.value }))} required />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-email">Email</Label>
                      <Input id="lead-email" type="email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-phone">Phone</Label>
                      <Input id="lead-phone" type="tel" value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-vehicle">Vehicle if known</Label>
                      <Input id="lead-vehicle" value={form.vehicle} onChange={(e) => setForm((current) => ({ ...current, vehicle: e.target.value }))} placeholder="2022 Model Y, F-150, 911..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-service">Service interest</Label>
                      <Input id="lead-service" value={form.serviceInterest} onChange={(e) => setForm((current) => ({ ...current, serviceInterest: e.target.value }))} placeholder="Tint, coating, maintenance, quote..." />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lead-summary">What are you trying to get done?</Label>
                    <Textarea id="lead-summary" value={form.summary} onChange={(e) => setForm((current) => ({ ...current, summary: e.target.value }))} rows={5} className="resize-none" placeholder="Share timing, concerns, package questions, or anything the shop should know before contacting you." />
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <Checkbox
                      id="lead-marketing-opt-in"
                      checked={form.marketingOptIn}
                      onCheckedChange={(checked) => setForm((current) => ({ ...current, marketingOptIn: checked === true }))}
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <Label htmlFor="lead-marketing-opt-in" className="cursor-pointer">
                        I&apos;m okay receiving follow-up from this shop
                      </Label>
                      <p className="text-xs text-slate-600">
                        This helps the shop send booking and service follow-up when it makes sense.
                      </p>
                    </div>
                  </div>
                  {error ? <p className="text-sm text-rose-700">{error}</p> : null}
                  <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Send request
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
