import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { CalendarDays, CarFront, ExternalLink, FileText, Receipt, ShieldCheck } from "lucide-react";
import { API_BASE } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PortalSummary = {
  business: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  client: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
  currentDocument: {
    kind: "quote" | "invoice" | "appointment";
    id: string;
    title: string;
    status: string;
    url: string;
  };
  portalUrl: string;
  sections: {
    quotes: Array<{
      id: string;
      status: string;
      total: number;
      expiresAt: string | null;
      createdAt: string | null;
      vehicleLabel: string | null;
      url: string;
    }>;
    invoices: Array<{
      id: string;
      invoiceNumber: string | null;
      status: string;
      total: number;
      balance: number;
      dueDate: string | null;
      createdAt: string | null;
      url: string;
      payUrl: string | null;
    }>;
    upcomingAppointments: Array<{
      id: string;
      title: string;
      status: string;
      startTime: string | null;
      totalPrice: number;
      depositAmount: number;
      balanceDue?: number | null;
      paidInFull?: boolean | null;
      depositSatisfied?: boolean | null;
      vehicleLabel: string | null;
      url: string;
      payUrl: string | null;
    }>;
    recentAppointments: Array<{
      id: string;
      title: string;
      status: string;
      startTime: string | null;
      totalPrice: number;
      vehicleLabel: string | null;
      url: string;
    }>;
    vehicles: Array<{
      id: string;
      label: string;
      color: string | null;
      licensePlate: string | null;
    }>;
  };
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(value) ? value : 0
  );
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function labelStatus(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ResourceBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em]">
      {labelStatus(status)}
    </Badge>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-1">{detail}</p>
    </div>
  );
}

export function meta() {
  return [
    { title: "Customer hub | Strata" },
    { name: "description", content: "Review your active estimates, invoices, appointments, and vehicle info in one place." },
  ];
}

export default function PortalTokenRoute() {
  const { token } = useParams();
  const [data, setData] = useState<PortalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This customer hub link is invalid.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/portal/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as PortalSummary & { message?: string };
        if (!response.ok) {
          throw new Error(payload.message || "This customer hub is unavailable right now.");
        }
        return payload;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "This customer hub is unavailable right now.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const clientName = useMemo(() => {
    if (!data) return "Customer";
    return [data.client.firstName, data.client.lastName].filter(Boolean).join(" ") || "Customer";
  }, [data]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-10 sm:px-6 lg:px-8">
        {loading ? (
          <Card className="mx-auto w-full max-w-3xl border-slate-200/80 bg-white/92">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">Customer hub</Badge>
              <CardTitle>Loading your service details...</CardTitle>
              <CardDescription>Pulling together your active estimates, invoices, appointments, and vehicles.</CardDescription>
            </CardHeader>
          </Card>
        ) : error || !data ? (
          <Card className="mx-auto w-full max-w-3xl border-rose-200 bg-white">
            <CardHeader>
              <Badge variant="secondary" className="w-fit bg-rose-100 text-rose-900">Link problem</Badge>
              <CardTitle>This customer hub link is unavailable</CardTitle>
              <CardDescription>{error || "The link may have expired or been opened incorrectly."}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/">Back to Strata</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="border-slate-200/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <CardHeader className="gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Badge variant="secondary" className="w-fit">Customer hub</Badge>
                    <CardTitle className="text-3xl tracking-tight text-slate-950">
                      {data.business.name || "Your shop"} has everything in one place now
                    </CardTitle>
                    <CardDescription className="max-w-2xl text-sm leading-6">
                      Review your current estimate, unpaid invoices, appointments, and vehicle details without digging through separate links.
                    </CardDescription>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p className="break-words font-medium text-slate-900">{clientName}</p>
                    {data.client.email ? <p className="break-all">{data.client.email}</p> : null}
                    {data.client.phone ? <p className="break-words">{data.client.phone}</p> : null}
                  </div>
                </div>
                <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium text-slate-900">Current document</p>
                        <p className="min-w-0 break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
                          You came in from {data.currentDocument.title.toLowerCase()}. Use the hub to open that same document or jump to the rest of your active items with {data.business.name || "the shop"}.
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button asChild className="h-auto min-w-0 max-w-full overflow-hidden rounded-2xl px-5 py-3 md:w-auto">
                    <a href={data.currentDocument.url} className="w-full min-w-0 justify-center text-center md:w-auto">
                      <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">Open {data.currentDocument.title}</span>
                      <ExternalLink className="ml-2 h-4 w-4 shrink-0" />
                    </a>
                  </Button>
                </div>
              </CardHeader>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div className="space-y-6">
                <Card className="border-slate-200/80 bg-white">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-600" />
                      <CardTitle>Open estimates</CardTitle>
                    </div>
                    <CardDescription>Anything still under review, awaiting approval, or not yet expired.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.sections.quotes.length === 0 ? (
                      <EmptyState title="No active estimates" detail="When the shop shares another estimate with you, it will show up here." />
                    ) : (
                      data.sections.quotes.map((quote) => (
                        <div key={quote.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-sm font-semibold text-slate-950">Estimate</p>
                              <p className="break-words text-sm text-slate-600 [overflow-wrap:anywhere]">{quote.vehicleLabel || "Vehicle details attached in the estimate"}</p>
                              <p className="break-words text-xs uppercase tracking-[0.16em] text-slate-500 [overflow-wrap:anywhere]">
                                Created {formatDate(quote.createdAt)}{quote.expiresAt ? ` • valid through ${formatDate(quote.expiresAt)}` : ""}
                              </p>
                            </div>
                            <div className="shrink-0 space-y-2 text-left sm:text-right">
                              <ResourceBadge status={quote.status} />
                              <p className="text-base font-semibold text-slate-950">{formatCurrency(quote.total)}</p>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button asChild variant="outline" size="sm" className="rounded-full">
                                <a href={quote.url}>View estimate</a>
                              </Button>
                              <Button asChild variant="outline" size="sm" className="rounded-full">
                                <a href={`${quote.url}#request-revision`}>Request changes</a>
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-slate-600" />
                      <CardTitle>Unpaid invoices</CardTitle>
                    </div>
                    <CardDescription>Outstanding balances still waiting to be collected.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.sections.invoices.length === 0 ? (
                      <EmptyState title="No unpaid invoices" detail="Paid invoices drop out of this section automatically once the balance is cleared." />
                    ) : (
                      data.sections.invoices.map((invoice) => (
                        <div key={invoice.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-sm font-semibold text-slate-950">
                                {invoice.invoiceNumber ? `Invoice #${invoice.invoiceNumber}` : "Invoice"}
                              </p>
                              <p className="break-words text-sm text-slate-600 [overflow-wrap:anywhere]">
                                Due {formatDate(invoice.dueDate)} • total {formatCurrency(invoice.total)}
                              </p>
                            </div>
                            <div className="shrink-0 space-y-2 text-left sm:text-right">
                              <ResourceBadge status={invoice.status} />
                              <p className="text-base font-semibold text-slate-950">{formatCurrency(invoice.balance)} due</p>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button asChild variant="outline" size="sm" className="rounded-full">
                              <a href={invoice.url}>View invoice</a>
                            </Button>
                            {invoice.payUrl ? (
                              <Button asChild size="sm" className="rounded-full">
                                <a href={invoice.payUrl}>Pay now</a>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-slate-600" />
                      <CardTitle>Upcoming appointments</CardTitle>
                    </div>
                    <CardDescription>Your next scheduled visits with direct access to the appointment details page.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.sections.upcomingAppointments.length === 0 ? (
                      <EmptyState title="No upcoming appointments" detail="As soon as the shop books your next visit, it will appear here." />
                    ) : (
                      data.sections.upcomingAppointments.map((appointment) => (
                        <div key={appointment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="break-words text-sm font-semibold leading-5 text-slate-950 [overflow-wrap:anywhere]">{appointment.title}</p>
                              <p className="text-sm text-slate-600">{formatDateTime(appointment.startTime)}</p>
                              {appointment.vehicleLabel ? <p className="break-words text-sm text-slate-500 [overflow-wrap:anywhere]">{appointment.vehicleLabel}</p> : null}
                            </div>
                            <div className="shrink-0 space-y-2 text-left sm:text-right">
                              <ResourceBadge status={appointment.status} />
                              {appointment.depositAmount > 0 ? (
                                <p className="text-sm text-slate-700">
                                  {appointment.depositSatisfied === true || appointment.paidInFull === true
                                    ? "Deposit paid"
                                    : `${formatCurrency(appointment.depositAmount)} deposit due`}
                                </p>
                              ) : (
                                <p className="text-sm text-slate-700">
                                  {appointment.paidInFull === true
                                    ? "Paid in full"
                                    : appointment.balanceDue != null
                                      ? `${formatCurrency(appointment.balanceDue)} due`
                                      : formatCurrency(appointment.totalPrice)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button asChild variant="outline" size="sm" className="min-w-0 rounded-full">
                              <a href={appointment.url}>View appointment</a>
                            </Button>
                            <Button asChild variant="outline" size="sm" className="min-w-0 rounded-full">
                              <a href={`${appointment.url}#request-change`}>Request change</a>
                            </Button>
                            {appointment.payUrl ? (
                              <Button asChild size="sm" className="min-w-0 rounded-full">
                                <a href={appointment.payUrl}>Pay deposit</a>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="border-slate-200/80 bg-white">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CarFront className="h-4 w-4 text-slate-600" />
                      <CardTitle>Vehicles on file</CardTitle>
                    </div>
                    <CardDescription>Quick reference for the vehicles this shop already has tied to your record.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.sections.vehicles.length === 0 ? (
                      <EmptyState title="No vehicles saved yet" detail="Once the shop adds your vehicle details, they will show up here." />
                    ) : (
                      data.sections.vehicles.map((vehicle) => (
                        <div key={vehicle.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm font-semibold text-slate-950">{vehicle.label}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {[vehicle.color, vehicle.licensePlate].filter(Boolean).join(" • ") || "Vehicle details on file"}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white">
                  <CardHeader>
                    <CardTitle>Recent service history</CardTitle>
                    <CardDescription>A lightweight history view so repeat visits are easier to track.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.sections.recentAppointments.length === 0 ? (
                      <EmptyState title="No recent visits yet" detail="Finished or past appointments will show up here after the shop records them." />
                    ) : (
                      data.sections.recentAppointments.map((appointment) => (
                        <a key={appointment.id} href={appointment.url} className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="break-words text-sm font-semibold leading-5 text-slate-950 [overflow-wrap:anywhere]">{appointment.title}</p>
                              <p className="text-sm text-slate-600">{formatDateTime(appointment.startTime)}</p>
                              {appointment.vehicleLabel ? <p className="break-words text-sm text-slate-500 [overflow-wrap:anywhere]">{appointment.vehicleLabel}</p> : null}
                            </div>
                            <div className="shrink-0 space-y-2 text-left sm:text-right">
                              <ResourceBadge status={appointment.status} />
                              <p className="text-sm text-slate-700">{formatCurrency(appointment.totalPrice)}</p>
                            </div>
                          </div>
                        </a>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white">
                  <CardHeader>
                    <CardTitle>Need help?</CardTitle>
                    <CardDescription>Reach the shop directly if anything in your record needs to be changed.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-600">
                    {data.business.phone ? <p>{data.business.phone}</p> : null}
                    {data.business.email ? <p>{data.business.email}</p> : null}
                    <div className="pt-2">
                      <Button asChild variant="outline">
                        <a href={data.currentDocument.url}>
                          Back to current document
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
