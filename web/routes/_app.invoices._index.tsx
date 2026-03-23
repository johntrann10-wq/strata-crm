import { useState, useEffect, useRef } from "react";
import { Link, useOutletContext } from "react-router";
import { useFindMany, useGlobalAction } from "../hooks/useApi";
import { api, ApiError } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, FileText, DollarSign, Clock, Loader2, AlertCircle } from "lucide-react";
import { StatusBadge } from "../components/shared/StatusBadge";
import { PageHeader } from "../components/shared/PageHeader";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";

const FILTER_TABS = ["all", "draft", "sent", "paid", "partial", "void"] as const;
type FilterTab = (typeof FILTER_TABS)[number];

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null || amount === "") return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function InvoicesIndexPage() {
  const { businessId } = useOutletContext<AuthOutletContext>();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [pageSize, setPageSize] = useState(25);

  const hasLoadedMetrics = useRef(false);

  const [{ data: invoiceMetrics, fetching: metricsFetching, error: metricsError }, runGetMetrics] =
    useGlobalAction((api as any).getInvoiceMetrics);

  useEffect(() => {
    if (businessId) {
      void runGetMetrics().then(() => {
        hasLoadedMetrics.current = true;
      });
    }
  }, [businessId]);

  useEffect(() => {
    setPageSize(25);
  }, [activeTab]);

  const [{ data: invoices, fetching: invoicesFetching, error: invoicesError }, refetchInvoices] = useFindMany(
    api.invoice,
    {
      status: activeTab === "all" ? undefined : activeTab,
      sort: { createdAt: "Descending" },
      first: pageSize,
      pause: !businessId,
    }
  );

  const isLoading = invoicesFetching && !invoices;
  const isRefetching = invoicesFetching && !!invoices && invoices.length > 0;

  const displayedInvoices = invoices ?? [];
  const pageError = metricsError ?? invoicesError;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Invoices
            {isRefetching && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </span>
        }
        subtitle="Manage and track your invoices"
        right={
          <Button asChild>
            <Link to="/invoices/new">
              <PlusCircle className="h-4 w-4 mr-2" />
              New Invoice
            </Link>
          </Button>
        }
      />

      {/* Error state (avoid raw stack traces) */}
      {pageError && !isLoading && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Could not load invoices</div>
            <div className="text-xs text-destructive/70 mt-1">
              {pageError instanceof ApiError && (pageError.status === 401 || pageError.status === 403)
                ? "Your session expired. Redirecting to sign-in…"
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
      )}

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue This Month
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsFetching && !invoiceMetrics ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency((invoiceMetrics as any)?.revenueThisMonth ?? 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Outstanding
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsFetching && !invoiceMetrics ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold text-yellow-600">
                {formatCurrency((invoiceMetrics as any)?.outstandingBalance ?? 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Sent &amp; partial invoices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsFetching && !invoiceMetrics ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{(invoiceMetrics as any)?.invoicesThisMonth ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Invoices created
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs + Table */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 pt-4">
            <Tabs
              value={activeTab}
              onValueChange={(val) => setActiveTab(val as FilterTab)}
            >
              <TabsList className="mb-4">
                {FILTER_TABS.map((tab) => (
                  <TabsTrigger key={tab} value={tab} className="capitalize">
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Invoice #
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Client
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Amount
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Date Created
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Due Date
                  </th>
                </tr>
              </thead>
              <tbody className={isRefetching ? "opacity-60" : ""}>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-32" />
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
                    </tr>
                  ))
                ) : invoicesError ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      Could not load this list. Use &quot;Try again&quot; above.
                    </td>
                  </tr>
                ) : displayedInvoices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-8 w-8 opacity-30" />
                        <p className="font-medium">No invoices found</p>
                        <p className="text-xs">
                          {activeTab === "all"
                            ? "Create your first invoice to get started."
                            : `No ${activeTab} invoices yet.`}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedInvoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="border-b hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/invoices/${invoice.id}`}
                          className="font-bold text-primary hover:underline"
                        >
                          {invoice.invoiceNumber ?? `#${invoice.id.slice(0, 8)}`}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {invoice.client
                          ? `${invoice.client.firstName} ${invoice.client.lastName}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {formatCurrency(invoice.total)}
                      </td>
                      <td className="px-4 py-3">
                        {invoice.status ? (
                          <StatusBadge status={invoice.status} type="invoice" />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(invoice.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(invoice.dueDate)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && displayedInvoices.length > 0 && (
            <div className="px-4 py-3 border-t text-xs text-muted-foreground">
              Showing {displayedInvoices.length}{" "}
              {displayedInvoices.length === 1 ? "invoice" : "invoices"}
            </div>
          )}

          {(invoices?.length ?? 0) >= pageSize && (
            <div className="flex justify-center px-4 py-4 border-t">
              <Button
                variant="outline"
                onClick={() => setPageSize((p) => p + 25)}
                disabled={invoicesFetching}
              >
                {invoicesFetching ? "Loading..." : "Load more invoices"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };