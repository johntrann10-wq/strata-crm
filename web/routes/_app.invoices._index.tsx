import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useOutletContext, useSearchParams } from "react-router";
import { AlertCircle, ChevronRight, FileText, Loader2, PlusCircle, Search } from "lucide-react";
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
import { formatFreshness, formatShortDate, isOlderThanDays, safeDate } from "../lib/queueDateUtils";
import { getInvoiceCollectionSummary } from "../lib/paymentStates";
import { selectorTabsListClassName, selectorTabsTriggerClassName } from "../components/shared/selectorStyles";
import { isNativeIOSApp } from "@/lib/mobileShell";
import { triggerImpactFeedback } from "@/lib/nativeInteractions";

const FILTER_TABS = ["all", "overdue", "stale", "draft", "sent", "paid", "partial", "void"] as const;
type FilterTab = (typeof FILTER_TABS)[number];
type InvoiceRecord = Record<string, any>;

const FILTER_TAB_OPTIONS: Array<{ value: FilterTab; label: string; shortLabel: string }> = [
  { value: "all", label: "All invoices", shortLabel: "All" },
  { value: "overdue", label: "Overdue", shortLabel: "Overdue" },
  { value: "stale", label: "Needs follow-up", shortLabel: "Follow-up" },
  { value: "draft", label: "Draft", shortLabel: "Draft" },
  { value: "sent", label: "Sent", shortLabel: "Sent" },
  { value: "paid", label: "Paid", shortLabel: "Paid" },
  { value: "partial", label: "Partially paid", shortLabel: "Partial" },
  { value: "void", label: "Void", shortLabel: "Void" },
];

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
  return formatShortDate(dateStr) ?? "-";
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

function getInvoiceVehicleLabel(invoice: InvoiceRecord) {
  return invoice.vehicle ? [invoice.vehicle.year, invoice.vehicle.make, invoice.vehicle.model].filter(Boolean).join(" ") : "-";
}

function getInvoiceClientName(invoice: InvoiceRecord) {
  return invoice.client ? `${invoice.client.firstName} ${invoice.client.lastName}`.trim() : "-";
}

function getInvoiceDisplayState(invoice: InvoiceRecord) {
  const vehicleLabel = getInvoiceVehicleLabel(invoice);
  const clientName = getInvoiceClientName(invoice);
  const outstanding = balanceAmount(invoice);
  const paid = paidAmount(invoice);
  const primaryAmount = primaryInvoiceAmount(invoice);
  const hasPaymentHistory = paid > 0;
  const lastSent = formatFreshness((invoice as any).lastSentAt, "Sent", formatShortDate);
  const lastPaid = formatFreshness((invoice as any).lastPaidAt, "Paid", formatShortDate);
  const isOverdue = isOverdueInvoice(invoice);
  const collectionSummary = getInvoiceCollectionSummary({
    status: invoice.status,
    total: invoice.total,
    totalPaid: invoice.totalPaid,
    remainingBalance: invoice.remainingBalance,
    isOverdue,
  });

  return {
    vehicleLabel,
    clientName,
    outstanding,
    paid,
    primaryAmount,
    hasPaymentHistory,
    lastSent,
    lastPaid,
    isOverdue,
    collectionSummary,
  };
}

export default function InvoicesIndexPage() {
  const location = useLocation();
  const { businessId } = useOutletContext<AuthOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const nativeIOS = isNativeIOSApp();
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
      setSearchParams(next, { replace: true, preventScrollReset: true });
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
      status: activeTab === "all" || activeTab === "overdue" || activeTab === "stale" ? undefined : activeTab,
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

  const handleTabChange = (value: string) => {
    if (!(FILTER_TABS as readonly string[]).includes(value)) return;
    void triggerImpactFeedback("light");
    setActiveTab(value as FilterTab);
  };

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
    <div
      className={cn(
        nativeIOS
          ? "mx-auto w-full max-w-3xl space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2"
          : "page-content page-section max-w-6xl"
      )}
    >
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Invoices
            {isRefetching ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
          </span>
        }
        right={
          <Button asChild className={cn(nativeIOS && "h-11 w-full rounded-[20px] shadow-[0_10px_25px_rgba(249,115,22,0.16)] sm:w-auto")}>
            <Link
              to={linkWithQueueState("/invoices/new")}
              onClick={() => {
                void triggerImpactFeedback("light");
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              New Invoice
            </Link>
          </Button>
        }
      />

      <section
        className={cn(
          "overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_24%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]",
          nativeIOS && "rounded-[30px] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] p-3.5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
        )}
      >
        <div className={cn("grid gap-3 md:grid-cols-4", nativeIOS && "grid-cols-2 md:grid-cols-2")}>
          <InvoiceMetricCard label="Month" value={formatCurrency((invoiceMetrics as any)?.revenueThisMonth ?? 0)} tone="success" nativeIOS={nativeIOS} />
          <InvoiceMetricCard label="Collect" value={formatCurrency((invoiceMetrics as any)?.outstandingBalance ?? 0)} tone="warn" nativeIOS={nativeIOS} />
          <InvoiceMetricCard label="Overdue" value={String(overdueInvoices.length)} nativeIOS={nativeIOS} />
          <InvoiceMetricCard label="Follow-up" value={String(staleInvoices.length)} highlight nativeIOS={nativeIOS} />
        </div>
      </section>

      {nativeIOS ? (
        <div className="rounded-[28px] border border-white/80 bg-white/92 p-3.5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search invoice, client, vehicle"
              className="h-12 rounded-[20px] border-white/80 bg-slate-50/80 pl-10 text-[16px] shadow-inner"
            />
          </div>
          {(activeTab !== "all" || debouncedSearch) ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="truncate text-xs font-medium text-slate-500">
                {displayedInvoices.length} {displayedInvoices.length === 1 ? "invoice" : "invoices"} in view
              </p>
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-full px-3 text-xs"
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                  setActiveTab("all");
                }}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
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
              .join(" - ") || null
          }
          onClear={() => {
            setSearch("");
            setDebouncedSearch("");
            setActiveTab("all");
          }}
        />
      )}

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
            title="Overdue balances need follow-up"
            detail={`${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"} are past due`}
            amount={formatCurrency(overdueInvoices.reduce((sum, invoice) => sum + balanceAmount(invoice), 0))}
            href={`/invoices/${overdueInvoices[0].id}`}
            actionLabel="Open oldest overdue invoice"
          />
        </div>
      ) : null}

      <Card className={cn(nativeIOS && "rounded-[30px] border-white/80 bg-white/92 shadow-[0_18px_40px_rgba(15,23,42,0.06)]")}>
        <CardContent className="p-0">
          {nativeIOS ? (
            <div className="-mx-1 overflow-x-auto px-4 pb-1 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2">
                {FILTER_TAB_OPTIONS.map((tab) => {
                  const count = tab.value === "overdue" ? overdueInvoices.length : tab.value === "stale" ? staleInvoices.length : null;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => handleTabChange(tab.value)}
                      className={cn(
                        "h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition active:scale-[0.98]",
                        activeTab === tab.value
                          ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                          : "border-white/80 bg-white/92 text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                      )}
                    >
                      {tab.shortLabel}
                      {count && count > 0 ? <span className="ml-1.5 text-xs opacity-80">{count}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="px-4 pt-4">
              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className={selectorTabsListClassName("mb-4 w-full")}>
                  {FILTER_TAB_OPTIONS.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={selectorTabsTriggerClassName("capitalize")}
                    >
                      {tab.label}
                      {tab.value === "overdue" && overdueInvoices.length > 0 ? (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-100 px-1.5 text-[10px] font-medium leading-none text-red-700">
                          {overdueInvoices.length}
                        </span>
                      ) : null}
                      {tab.value === "stale" && staleInvoices.length > 0 ? (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-medium leading-none text-amber-700">
                          {staleInvoices.length}
                        </span>
                      ) : null}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          )}

          <div className={cn("space-y-3 p-4 md:hidden", nativeIOS && "px-3.5 pt-3")}>
            {isLoading
              ? Array.from({ length: 4 }).map((_, index) => (
                  <Card key={index} className="rounded-2xl border-border/70">
                    <CardContent className="space-y-3 p-4">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-24" />
                      <div className="flex gap-2">
                        <Skeleton className="h-8 w-20" />
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              : invoicesError
                ? (
                  <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-6 text-center text-sm text-muted-foreground">
                    Could not load this list. Use "Try again" above.
                  </div>
                )
                : displayedInvoices.length === 0
                  ? (
                    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-12 text-center text-muted-foreground">
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
                    </div>
                  )
                  : displayedInvoices.map((invoice) => {
                      const { vehicleLabel, outstanding, primaryAmount, lastSent, lastPaid, clientName, isOverdue, collectionSummary } =
                        getInvoiceDisplayState(invoice);

                      return (
                        <InvoiceMobileCard
                          key={invoice.id}
                          title={invoice.invoiceNumber ?? `#${invoice.id.slice(0, 8)}`}
                          subtitle={vehicleLabel !== "-" ? `${clientName} - ${vehicleLabel}` : clientName}
                          status={String(invoice.status ?? "")}
                          amount={formatCurrency(primaryAmount)}
                          overdue={isOverdue}
                          accent={
                            overdueInvoices.some((entry) => entry.id === invoice.id)
                              ? "danger"
                              : String(invoice.status ?? "") === "paid"
                                ? "success"
                                : String(invoice.status ?? "") === "partial"
                                  ? "warn"
                                  : "default"
                          }
                          lines={[
                            `Created ${formatDate(invoice.createdAt)}`,
                            `Due ${formatDate(invoice.dueDate)}`,
                            collectionSummary.title,
                            [lastSent, lastPaid].filter(Boolean).join(" - ") || null,
                          ]}
                          href={linkWithQueueState(`/invoices/${invoice.id}`)}
                          nativeIOS={nativeIOS}
                          actions={
                            <>
                              {["draft", "sent", "partial"].includes(String(invoice.status ?? "")) ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-3 text-xs"
                                  disabled={sendingInvoiceId !== null}
                                  onClick={() => void handleSendInvoice(invoice.id)}
                                >
                                  {sendingInvoiceId === invoice.id ? (
                                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                  ) : null}
                                  {invoice.status === "draft" ? "Send" : "Resend"}
                                </Button>
                              ) : null}
                              {["sent", "partial"].includes(String(invoice.status ?? "")) ? (
                                <Button asChild size="sm" variant="outline" className="h-8 px-3 text-xs">
                                  <Link to={linkWithQueueState(`/invoices/${invoice.id}`)}>
                                    {outstanding > 0 ? `Collect ${formatCurrency(outstanding)}` : "Collect payment"}
                                  </Link>
                                </Button>
                              ) : null}
                            </>
                          }
                        />
                      );
                    })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50/80">
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
                          const { vehicleLabel, outstanding, paid, primaryAmount, hasPaymentHistory, lastSent, lastPaid, isOverdue, collectionSummary } =
                            getInvoiceDisplayState(invoice);

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
                                    {hasPaymentHistory ? ` - Paid ${formatCurrency(paid)}` : ""}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{collectionSummary.detail}</div>
                                  {lastSent || lastPaid ? (
                                    <div className="text-xs text-muted-foreground">
                                      {[lastSent, lastPaid].filter(Boolean).join(" - ")}
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
                                  {isOverdue ? (
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
                                        {outstanding > 0 ? `Collect ${formatCurrency(outstanding)}` : "Collect payment"}
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
            <div className={cn("border-t px-4 py-3 text-xs text-muted-foreground", nativeIOS && "border-slate-100 px-4")}>
              Showing {displayedInvoices.length} {displayedInvoices.length === 1 ? "invoice" : "invoices"}
            </div>
          ) : null}

          {(invoices?.length ?? 0) >= pageSize ? (
            <div className={cn("flex justify-center border-t px-4 py-4", nativeIOS && "border-slate-100")}>
              <Button variant="outline" className={cn(nativeIOS && "h-11 rounded-full px-5")} onClick={() => setPageSize((value) => value + 25)} disabled={invoicesFetching}>
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

function InvoiceMetricCard({
  label,
  value,
  tone = "default",
  highlight = false,
  nativeIOS = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warn";
  highlight?: boolean;
  nativeIOS?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]",
        highlight && "bg-slate-950 text-white shadow-[0_18px_45px_rgba(15,23,42,0.22)]",
        nativeIOS && "rounded-[24px] px-3.5 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]"
      )}
    >
      <p className={cn("text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400", highlight && "text-orange-300", nativeIOS && "text-[10px] tracking-[0.14em]")}>
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-slate-950",
          tone === "success" && "text-emerald-700",
          tone === "warn" && "text-amber-700",
          highlight && "text-white",
          nativeIOS && "text-xl leading-none"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FollowupCard({
  title,
  detail,
  amount,
  href,
  actionLabel,
}: {
  title: string;
  detail: string;
  amount: string;
  href: string;
  actionLabel: string;
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

function InvoiceMobileCard({
  title,
  subtitle,
  status,
  amount,
  lines,
  href,
  actions,
  overdue = false,
  accent = "default",
  nativeIOS = false,
}: {
  title: string;
  subtitle: string;
  status: string;
  amount: string;
  lines: Array<string | null | undefined>;
  href: string;
  actions?: ReactNode;
  overdue?: boolean;
  accent?: "default" | "warn" | "success" | "danger";
  nativeIOS?: boolean;
}) {
  const toneClass =
    accent === "danger"
      ? "border-red-200/80 bg-red-50/70"
      : accent === "warn"
        ? "border-amber-200/80 bg-amber-50/70"
        : accent === "success"
          ? "border-emerald-200/80 bg-emerald-50/70"
          : "border-border/70 bg-card/98";

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        toneClass,
        nativeIOS && "rounded-[26px] border-white/80 bg-white/92 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] active:scale-[0.99]",
        nativeIOS && accent === "danger" && "border-red-200/80 bg-red-50/70",
        nativeIOS && accent === "warn" && "border-amber-200/80 bg-amber-50/70",
        nativeIOS && accent === "success" && "border-emerald-200/80 bg-emerald-50/70"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link to={href} className="block min-w-0">
            <p className={cn("truncate text-sm font-semibold text-foreground", nativeIOS && "text-[17px] leading-6 tracking-[-0.02em]")}>{title}</p>
            <p className={cn("mt-1 truncate text-sm text-muted-foreground", nativeIOS && "text-[13px]")}>{subtitle}</p>
          </Link>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={status} type="invoice" />
          <span className={cn("text-sm font-semibold tabular-nums text-foreground", nativeIOS && "text-[15px]")}>{amount}</span>
          {overdue ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-red-700">
              Overdue
            </span>
          ) : null}
        </div>
      </div>
      <div className={cn("mt-3 space-y-1 text-xs text-muted-foreground", nativeIOS && "text-[12px] leading-5")}>
        {lines.filter(Boolean).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className={cn("mt-4 flex flex-wrap items-center gap-2", nativeIOS && "[&_button]:min-h-10 [&_a]:min-h-10 [&_a]:rounded-full [&_button]:rounded-full")}>
        {actions}
        <Button asChild size="sm" variant="ghost" className="h-8 px-3 text-xs">
          <Link to={href}>
            Open
            {nativeIOS ? <ChevronRight className="ml-1 h-3.5 w-3.5" /> : null}
          </Link>
        </Button>
      </div>
    </div>
  );
}
