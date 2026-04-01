import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useOutletContext, useSearchParams } from "react-router";
import { AlertCircle, FileText, Loader2, PlusCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { StatusBadge } from "../components/shared/StatusBadge";
import { PageHeader } from "../components/shared/PageHeader";
import { useFindMany, useGlobalAction } from "../hooks/useApi";
import { api, ApiError } from "../api";
import { useAction } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";

const FILTER_TABS = ["all", "overdue", "stale", "draft", "sent", "paid", "partial", "void"] as const;
type FilterTab = (typeof FILTER_TABS)[number];

function safeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null || amount === "") return "-";
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFreshness(dateStr: string | Date | null | undefined, label: string): string | null {
  if (!dateStr) return null;
  return `${label} ${formatDate(dateStr)}`;
}

function isOlderThanDays(value: string | Date | null | undefined, days: number): boolean {
  const parsed = safeDate(value);
  if (!parsed) return false;
  return Date.now() - parsed.getTime() >= days * 24 * 60 * 60 * 1000;
}

function isOverdueInvoice(invoice: { status?: string | null; dueDate?: string | Date | null | undefined }) {
  const dueDate = safeDate(invoice.dueDate);
  return ["sent", "partial"].includes(String(invoice.status ?? "")) && !!dueDate && dueDate.getTime() < Date.now();
}

function balanceAmount(invoice: { remainingBalance?: number | string | null; total?: number | string | null }) {
  if (invoice.remainingBalance != null && invoice.remainingBalance !== "") {
    const value =
      typeof invoice.remainingBalance === "string"
        ? Number(invoice.remainingBalance)
        : invoice.remainingBalance;
    return Number.isNaN(value) ? 0 : value;
  }
  const total = typeof invoice.total === "string" ? Number(invoice.total) : Number(invoice.total ?? 0);
  return Number.isNaN(total) ? 0 : total;
}

function paidAmount(invoice: { totalPaid?: number | string | null }) {
  const value =
    typeof invoice.totalPaid === "string" ? Number(invoice.totalPaid) : Number(invoice.totalPaid ?? 0);
  return Number.isNaN(value) ? 0 : value;
}

function primaryInvoiceAmount(invoice: {
  status?: string | null;
  total?: number | string | null;
  remainingBalance?: number | string | null;
  totalPaid?: number | string | null;
}) {
  const outstanding = balanceAmount(invoice);
  const paid = paidAmount(invoice);
  const total = typeof invoice.total === "string" ? Number(invoice.total) : Number(invoice.total ?? 0);
  const normalizedTotal = Number.isNaN(total) ? 0 : total;

  if (String(invoice.status ?? "") === "paid" && paid > 0) {
    return paid;
  }

  if (outstanding <= 0 && paid > 0) {
    return paid;
  }

  return outstanding > 0 ? outstanding : normalizedTotal;
}

export default function InvoicesIndexPage() {
  const location = useLocation();
  const { businessId } = useOutletContext<AuthOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (FILTER_TABS as readonly string[]).includes(searchParams.get("tab") ?? "")
    ? (searchParams.get("tab") as FilterTab)
    : "all";
  const initialSearch = searchParams.get("q") ?? "";
  const [activeTab, setActiveTab] = useState<FilterTab>(initialTab);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const hasLoadedMetrics = useRef(false);

  const [{ data: invoiceMetrics, fetching: metricsFetching, error: metricsError }, runGetMetrics] =
    useGlobalAction((api as any).getInvoiceMetrics);
  const [, runSendInvoice] = useAction(api.invoice.sendToClient);

  useEffect(() => {
    if (!businessId) return;
    void runGetMetrics().then(() => {
      hasLoadedMetrics.current = true;
    });
  }, [businessId, runGetMetrics]);

  useEffect(() => {
    setPageSize(25);
  }, [activeTab, debouncedSearch]);

  useEffect(() => {
    const nextSearch = searchParams.get("q") ?? "";
    if (nextSearch !== search) {
      setSearch(nextSearch);
      setDebouncedSearch(nextSearch);
    }
  }, [searchParams, search]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", activeTab);
    if (debouncedSearch) {
      next.set("q", debouncedSearch);
    } else {
      next.delete("q");
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, debouncedSearch, searchParams, setSearchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const [{ data: invoices, fetching: invoicesFetching, error: invoicesError }, refetchInvoices] = useFindMany(
    api.invoice,
    {
      search: debouncedSearch || undefined,
      status: activeTab === "all" || activeTab === "overdue" ? undefined : activeTab,
      sort: { createdAt: "Descending" },
      first: pageSize,
      pause: !businessId,
    }
  );

  const isLoading = invoicesFetching && !invoices;
  const isRefetching = invoicesFetching && !!invoices && invoices.length > 0;
  const baseInvoices = invoices ?? [];
  const overdueInvoices = baseInvoices.filter((invoice) => isOverdueInvoice(invoice));
  const staleInvoices = baseInvoices.filter(
    (invoice) =>
      ["sent", "partial"].includes(String(invoice.status ?? "")) &&
      !safeDate((invoice as any).lastPaidAt ?? null) &&
      isOlderThanDays((invoice as any).lastSentAt ?? null, 3)
  );
  const displayedInvoices = activeTab === "overdue" ? overdueInvoices : activeTab === "stale" ? staleInvoices : baseInvoices;
  const pageError = metricsError ?? invoicesError;
  const currentQueuePath = `${location.pathname}${location.search}`;
  const linkWithQueueState = (pathname: string) =>
    `${pathname}${pathname.includes("?") ? "&" : "?"}from=${encodeURIComponent(currentQueuePath)}`;

  const handleSendInvoice = async (invoiceId: string) => {
    setSendingInvoiceId(invoiceId);
    try {
      const result = await runSendInvoice({ id: invoiceId });
      if (result?.error) {
        toast.error(result.error.message ?? "Could not send invoice");
        return;
      }
        const deliveryStatus = (result?.data as { deliveryStatus?: string } | undefined)?.deliveryStatus;
        if (deliveryStatus === "emailed") {
          toast.success("Invoice emailed to client");
        } else {
          toast.warning("Invoice was marked as sent, but email was not delivered");
        }
      void refetchInvoices();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send invoice");
    } finally {
      setSendingInvoiceId(null);
    }
  };

  return (
    <div className="page-content page-section max-w-6xl">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Invoices
            {isRefetching ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
          </span>
        }
        subtitle="Manage receivables, search invoice history, and keep outstanding balances and collection pressure visible."
        right={
          <Button asChild>
            <Link to={linkWithQueueState("/invoices/new")}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Invoice
            </Link>
          </Button>
        }
      />

      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_24%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Revenue this month</p>
            <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-emerald-700">
              {formatCurrency((invoiceMetrics as any)?.revenueThisMonth ?? 0)}
            </p>
          </div>
          <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Outstanding</p>
            <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-amber-700">
              {formatCurrency((invoiceMetrics as any)?.outstandingBalance ?? 0)}
            </p>
          </div>
          <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Overdue</p>
            <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-slate-950">{overdueInvoices.length}</p>
          </div>
          <div className="rounded-[22px] border border-white/80 bg-slate-950 px-4 py-4 text-white shadow-[0_18px_45px_rgba(15,23,42,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">Stale follow-up</p>
            <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em]">{staleInvoices.length}</p>
          </div>
        </div>
      </section>

      <ListViewToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search invoice #, client, or vehicle..."
        loading={isRefetching}
        resultCount={displayedInvoices.length}
        noun="invoices"
        filtersLabel={
          [
            activeTab !== "all" ? `View: ${activeTab}` : null,
            debouncedSearch ? `Search: ${debouncedSearch}` : null,
          ]
            .filter(Boolean)
            .join(" • ") || null
        }
        onClear={() => {
          setSearch("");
          setDebouncedSearch("");
          setActiveTab("all");
        }}
      />

      {pageError && !isLoading ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">Could not load invoices</div>
            <div className="mt-1 text-xs text-destructive/70">
              {pageError instanceof ApiError && (pageError.status === 401 || pageError.status === 403)
                ? "Your session expired. Redirecting to sign-in..."
                : pageError.message}
            </div>
            <button
              className="mt-3 inline-flex items-center rounded-md border border-input bg-muted px-3 py-1.5 text-sm"
              onClick={() => {
                void runGetMetrics();
                void refetchInvoices();
              }}
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {overdueInvoices.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FollowupCard
            tone="danger"
            title="Overdue invoices need collection"
            detail={`${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"} are past due`}
            amount={formatCurrency(overdueInvoices.reduce((sum, invoice) => sum + balanceAmount(invoice), 0))}
            href={`/invoices/${overdueInvoices[0].id}`}
            actionLabel="Open oldest overdue invoice"
          />
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="px-4 pt-4">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FilterTab)}>
              <TabsList className="mb-4 flex w-full gap-2 overflow-x-auto rounded-xl bg-transparent p-0 sm:grid sm:w-auto sm:grid-cols-8 xl:w-full">
                {FILTER_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 capitalize data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5"
                  >
                    {tab}
                    {tab === "overdue" && overdueInvoices.length > 0 ? (
                      <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                        {overdueInvoices.length}
                      </span>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Invoice #</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vehicle</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date Created</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Due Date</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className={isRefetching ? "opacity-60" : ""}>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index} className="border-b">
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-32" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-28" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-20" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="ml-auto h-7 w-24" />
                        </td>
                      </tr>
                    ))
                  : invoicesError
                    ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Could not load this list. Use "Try again" above.
                        </td>
                      </tr>
                    )
                    : displayedInvoices.length === 0
                      ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <FileText className="h-8 w-8 opacity-30" />
                              <p className="font-medium">No invoices found</p>
                              <p className="text-xs">
                                {activeTab === "all"
                                  ? debouncedSearch
                                    ? "Try a different invoice number, client, or vehicle."
                                    : "Create the first invoice so Strata starts tracking real money, not just jobs."
                                  : `No ${activeTab} invoices match this view.`}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )
                      : displayedInvoices.map((invoice) => {
                          const vehicleLabel = invoice.vehicle
                            ? [invoice.vehicle.year, invoice.vehicle.make, invoice.vehicle.model].filter(Boolean).join(" ")
                            : "-";
                          const outstanding = balanceAmount(invoice);
                          const paid = paidAmount(invoice);
                          const primaryAmount = primaryInvoiceAmount(invoice);
                          const hasPaymentHistory = paid > 0;
                          const lastSent = formatFreshness((invoice as any).lastSentAt, "Sent");
                          const lastPaid = formatFreshness((invoice as any).lastPaidAt, "Paid");

                          return (
                            <tr
                              key={invoice.id}
                              className={cn(
                                "border-b transition-colors hover:bg-muted/20",
                                overdueInvoices.some((entry) => entry.id === invoice.id) && "bg-red-50/50"
                              )}
                            >
                              <td className="px-4 py-3">
                                <Link to={linkWithQueueState(`/invoices/${invoice.id}`)} className="font-bold text-primary hover:underline">
                                  {invoice.invoiceNumber ?? `#${invoice.id.slice(0, 8)}`}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {invoice.client ? (
                                  <Link to={`/clients/${invoice.client.id}`} className="hover:underline">
                                    {invoice.client.firstName} {invoice.client.lastName}
                                  </Link>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{vehicleLabel || "-"}</td>
                              <td className="px-4 py-3">
                                <div className="space-y-1">
                                  <div className="font-medium">{formatCurrency(primaryAmount)}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Total {formatCurrency(invoice.total)}
                                    {hasPaymentHistory ? ` · Paid ${formatCurrency(paid)}` : ""}
                                  </div>
                                  {lastSent || lastPaid ? (
                                    <div className="text-xs text-muted-foreground">
                                      {[lastSent, lastPaid].filter(Boolean).join(" · ")}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {invoice.status ? <StatusBadge status={invoice.status} type="invoice" /> : "-"}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{formatDate(invoice.createdAt)}</td>
                              <td className="px-4 py-3 text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <span>{formatDate(invoice.dueDate)}</span>
                                  {isOverdueInvoice(invoice) ? (
                                    <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                                      Overdue
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-2">
                                  {["draft", "sent", "partial"].includes(String(invoice.status ?? "")) ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-xs"
                                      disabled={sendingInvoiceId !== null}
                                      onClick={() => void handleSendInvoice(invoice.id)}
                                    >
                                      {sendingInvoiceId === invoice.id ? (
                                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                      ) : null}
                                      {invoice.status === "draft" ? "Send" : "Resend"}
                                    </Button>
                                  ) : null}
                                  <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                                      <Link to={linkWithQueueState(`/invoices/${invoice.id}`)}>Open</Link>
                                  </Button>
                                  {["sent", "partial"].includes(String(invoice.status ?? "")) ? (
                                    <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                                      <Link to={linkWithQueueState(`/invoices/${invoice.id}`)}>
                                        {outstanding > 0 ? `Collect ${formatCurrency(outstanding)}` : "Collect"}
                                      </Link>
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
              </tbody>
            </table>
          </div>

          {!isLoading && displayedInvoices.length > 0 ? (
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              Showing {displayedInvoices.length} {displayedInvoices.length === 1 ? "invoice" : "invoices"}
            </div>
          ) : null}

          {(invoices?.length ?? 0) >= pageSize ? (
            <div className="flex justify-center border-t px-4 py-4">
              <Button variant="outline" onClick={() => setPageSize((value) => value + 25)} disabled={invoicesFetching}>
                {invoicesFetching ? "Loading..." : "Load more invoices"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };

function FollowupCard({
  title,
  detail,
  amount,
  href,
  actionLabel,
  tone,
}: {
  title: string;
  detail: string;
  amount: string;
  href: string;
  actionLabel: string;
  tone: "danger";
}) {
  return (
    <div className={cn("rounded-lg border border-red-200 bg-red-50/80 p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <p className="text-sm font-semibold">{amount}</p>
      </div>
      <Button asChild size="sm" variant="outline" className="mt-3">
        <Link to={href}>{actionLabel}</Link>
      </Button>
    </div>
  );
}
