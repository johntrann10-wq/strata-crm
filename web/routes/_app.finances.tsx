import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useOutletContext } from "react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Landmark,
  Loader2,
  PlusCircle,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "../api";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";
import { PageHeader } from "../components/shared/PageHeader";
import { useAction, useFindMany, useGlobalAction } from "../hooks/useApi";
import { getPreferredAuthorizedAppPath } from "@/lib/permissionRouting";
import { cn } from "@/lib/utils";
import type { AuthOutletContext } from "./_app";

type FinanceDashboard = {
  kpis: {
    grossRevenue: number;
    moneyCollected: number;
    awaitingPayment: number;
    overdueInvoices: number;
    overdueInvoiceCount: number;
    expenses: number;
    netProfit: number;
    projectedNetProfit: number;
    collectionRate: number;
  };
  statusBuckets: Array<{
    status: "draft" | "sent" | "partial" | "paid" | "overdue";
    count: number;
    totalAmount: number;
  }>;
  recentPayments: Array<{
    id: string;
    clientName: string;
    invoiceNumber: string;
    amount: number;
    method: string;
    paidAt: string | null;
  }>;
  invoiceRows: Array<{
    id: string;
    clientName: string;
    invoiceNumber: string;
    totalAmount: number;
    amountPaid: number;
    balanceDue: number;
    dueDate: string | null;
    status: "draft" | "sent" | "partial" | "paid" | "overdue";
    createdAt: string;
  }>;
  trend: Array<{
    key: string;
    label: string;
    invoiced: number;
    collected: number;
    expenses: number;
  }>;
};

type ExpenseRecord = {
  id: string;
  expenseDate: string;
  vendor: string;
  category: string;
  description: string;
  amount: number | string;
  notes?: string | null;
};

type ExpenseFormState = {
  expenseDate: string;
  vendor: string;
  category: string;
  description: string;
  amount: string;
  notes: string;
};

const DEFAULT_EXPENSE_FORM: ExpenseFormState = {
  expenseDate: new Date().toISOString().slice(0, 10),
  vendor: "",
  category: "",
  description: "",
  amount: "",
  notes: "",
};

const INVOICE_FILTERS = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "awaiting", label: "Awaiting payment" },
  { id: "overdue", label: "Overdue" },
  { id: "partial", label: "Partial" },
] as const;

type InvoiceFilterId = (typeof INVOICE_FILTERS)[number]["id"];

function formatCurrency(amount: number | string | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMethod(value: string | null | undefined) {
  if (!value) return "Other";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function toExpenseForm(expense: ExpenseRecord | null): ExpenseFormState {
  if (!expense) return DEFAULT_EXPENSE_FORM;
  return {
    expenseDate: expense.expenseDate ? new Date(expense.expenseDate).toISOString().slice(0, 10) : DEFAULT_EXPENSE_FORM.expenseDate,
    vendor: expense.vendor ?? "",
    category: expense.category ?? "",
    description: expense.description ?? "",
    amount: Number(expense.amount ?? 0) > 0 ? String(expense.amount) : "",
    notes: expense.notes ?? "",
  };
}

function getFilteredInvoices(rows: FinanceDashboard["invoiceRows"], filter: InvoiceFilterId) {
  if (filter === "paid") return rows.filter((row) => row.status === "paid");
  if (filter === "awaiting") return rows.filter((row) => row.status === "sent" || row.status === "partial" || row.status === "overdue");
  if (filter === "overdue") return rows.filter((row) => row.status === "overdue");
  if (filter === "partial") return rows.filter((row) => row.status === "partial");
  return rows;
}

function getStatusBadgeClass(status: FinanceDashboard["invoiceRows"][number]["status"]) {
  if (status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "overdue") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "sent") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function getStatusLabel(status: FinanceDashboard["invoiceRows"][number]["status"]) {
  if (status === "overdue") return "Overdue";
  if (status === "partial") return "Partial";
  if (status === "paid") return "Paid";
  if (status === "sent") return "Sent";
  return "Draft";
}

export default function FinancesPage() {
  const outletContext = useOutletContext<AuthOutletContext>();
  if (!outletContext.permissions.has("payments.read")) {
    return <Navigate to={getPreferredAuthorizedAppPath(outletContext.permissions, outletContext.enabledModules)} replace />;
  }

  return <FinancesContent />;
}

function FinancesContent() {
  const { businessId, permissions } = useOutletContext<AuthOutletContext>();
  const canManage = permissions.has("payments.write");
  const [view, setView] = useState<"overview" | "expenses">("overview");
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilterId>("awaiting");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(DEFAULT_EXPENSE_FORM);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);

  const [{ data: dashboard, fetching: dashboardFetching, error: dashboardError }, runDashboard] = useGlobalAction(api.getFinanceDashboard);
  const [{ data: expenses, fetching: expensesFetching, error: expensesError }, refetchExpenses] = useFindMany(api.expense, {
    search: deferredSearch || undefined,
    sort: { expenseDate: "Descending" } as any,
    first: 100,
    pause: !businessId || view !== "expenses",
  });
  const [{ fetching: savingExpense }, saveExpense] = useAction((params?: Record<string, unknown>) => {
    if (editingExpense?.id) return api.expense.update({ id: editingExpense.id, ...(params ?? {}) });
    return api.expense.create(params ?? {});
  });
  const [{ fetching: deletingExpense }, deleteExpense] = useAction((params?: Record<string, unknown>) => {
    const id = params?.id as string | undefined;
    if (!id) throw new Error("Expense delete requires id");
    return api.expense.delete(id);
  });

  useEffect(() => {
    if (!businessId) return;
    void runDashboard({ paymentLimit: 8, invoiceLimit: 150, monthCount: 6 });
  }, [businessId, runDashboard]);

  const dashboardData = dashboard as FinanceDashboard | undefined;
  const expenseRecords = useMemo(() => (expenses ?? []) as ExpenseRecord[], [expenses]);
  const filteredInvoices = useMemo(
    () => getFilteredInvoices(dashboardData?.invoiceRows ?? [], invoiceFilter),
    [dashboardData?.invoiceRows, invoiceFilter]
  );
  const expenseTotalLoaded = useMemo(
    () => expenseRecords.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0),
    [expenseRecords]
  );

  const openCreateDialog = () => {
    setEditingExpense(null);
    setExpenseForm(DEFAULT_EXPENSE_FORM);
    setExpenseDialogOpen(true);
  };

  const openEditDialog = (expense: ExpenseRecord) => {
    setEditingExpense(expense);
    setExpenseForm(toExpenseForm(expense));
    setExpenseDialogOpen(true);
  };

  const handleSaveExpense = async () => {
    const amount = Number(expenseForm.amount);
    if (!expenseForm.vendor.trim() || !expenseForm.category.trim() || !expenseForm.description.trim()) {
      toast.error("Vendor, category, and description are required.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid expense amount.");
      return;
    }

    const result = await saveExpense({
      expenseDate: expenseForm.expenseDate,
      vendor: expenseForm.vendor.trim(),
      category: expenseForm.category.trim(),
      description: expenseForm.description.trim(),
      amount,
      notes: expenseForm.notes.trim() || null,
    });
    if (result?.error) {
      toast.error(result.error.message ?? "Could not save expense.");
      return;
    }

    await Promise.all([runDashboard({ paymentLimit: 8, invoiceLimit: 150, monthCount: 6 }), refetchExpenses()]);
    setExpenseDialogOpen(false);
    setEditingExpense(null);
    setExpenseForm(DEFAULT_EXPENSE_FORM);
    toast.success(editingExpense ? "Expense updated" : "Expense added");
  };

  const handleDeleteExpense = async () => {
    if (!deleteExpenseId) return;
    const result = await deleteExpense({ id: deleteExpenseId });
    if (result?.error) {
      toast.error(result.error.message ?? "Could not delete expense.");
      return;
    }

    await Promise.all([runDashboard({ paymentLimit: 8, invoiceLimit: 150, monthCount: 6 }), refetchExpenses()]);
    setDeleteExpenseId(null);
    toast.success("Expense deleted");
  };

  return (
    <>
      <div className="page-content page-section max-w-7xl">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              Finance
              {dashboardFetching ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
            </span>
          }
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={view === "overview" ? "default" : "outline"} onClick={() => setView("overview")}>
                Overview
              </Button>
              <Button variant={view === "expenses" ? "default" : "outline"} onClick={() => setView("expenses")}>
                Expenses
              </Button>
              <Button asChild variant="outline">
                <Link to="/invoices">
                  <Receipt className="mr-2 h-4 w-4" />
                  Invoices
                </Link>
              </Button>
              {canManage ? (
                <Button onClick={openCreateDialog}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Expense
                </Button>
              ) : null}
            </div>
          }
        />

        {dashboardError ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {dashboardError instanceof ApiError && (dashboardError.status === 401 || dashboardError.status === 403)
              ? "Your session no longer has access to finance data."
              : dashboardError.message}
          </div>
        ) : null}

        {view === "overview" ? (
          <FinanceOverview dashboard={dashboardData} loading={dashboardFetching && !dashboardData} invoiceFilter={invoiceFilter} onInvoiceFilterChange={setInvoiceFilter} filteredInvoices={filteredInvoices} />
        ) : (
          <ExpenseLedger
            metrics={dashboardData}
            canManage={canManage}
            search={search}
            onSearchChange={setSearch}
            expenses={expenseRecords}
            loading={expensesFetching && !expenses}
            refreshing={expensesFetching && !!expenses}
            error={expensesError}
            onAddExpense={openCreateDialog}
            onEditExpense={openEditDialog}
            onDeleteExpense={setDeleteExpenseId}
            totalTrackedExpenses={expenseTotalLoaded}
          />
        )}
      </div>

      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent
          className="ios-momentum-y max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-x-hidden overflow-y-auto p-0 sm:max-w-[560px]"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="p-6">
            <DialogHeader>
              <DialogTitle>{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
              <DialogDescription>Log operating spend.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="expense-date">Date</Label>
                  <Input
                    id="expense-date"
                    type="date"
                    value={expenseForm.expenseDate}
                    onChange={(event) => setExpenseForm((current) => ({ ...current, expenseDate: event.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expense-amount">Amount</Label>
                  <Input id="expense-amount" inputMode="decimal" placeholder="0.00" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="expense-vendor">Vendor</Label>
                  <Input id="expense-vendor" value={expenseForm.vendor} onChange={(event) => setExpenseForm((current) => ({ ...current, vendor: event.target.value }))} placeholder="Supplier or payee" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expense-category">Category</Label>
                  <Input id="expense-category" value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))} placeholder="Supplies, payroll, tools..." />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-description">Description</Label>
                <Input id="expense-description" value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} placeholder="What was this spend for?" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-notes">Notes</Label>
                <Textarea id="expense-notes" value={expenseForm.notes} onChange={(event) => setExpenseForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional note" rows={4} />
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setExpenseDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
              <Button onClick={() => void handleSaveExpense()} disabled={savingExpense} className="w-full sm:w-auto">
                {savingExpense ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingExpense ? "Save changes" : "Add expense"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteExpenseId} onOpenChange={(open) => !open && setDeleteExpenseId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete expense?</DialogTitle>
            <DialogDescription>This updates profit and expense totals immediately.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDeleteExpenseId(null)} className="w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDeleteExpense()} disabled={deletingExpense} className="w-full sm:w-auto">
              {deletingExpense ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FinanceOverview({
  dashboard,
  loading,
  invoiceFilter,
  onInvoiceFilterChange,
  filteredInvoices,
}: {
  dashboard: FinanceDashboard | undefined;
  loading: boolean;
  invoiceFilter: InvoiceFilterId;
  onInvoiceFilterChange: (filter: InvoiceFilterId) => void;
  filteredInvoices: FinanceDashboard["invoiceRows"];
}) {
  const kpis = dashboard?.kpis;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Gross revenue" value={loading ? null : formatCurrency(kpis?.grossRevenue ?? 0)} icon={<DollarSign className="h-4 w-4" />} />
        <KpiCard label="Money collected" value={loading ? null : formatCurrency(kpis?.moneyCollected ?? 0)} icon={<ArrowDownRight className="h-4 w-4" />} tone="success" />
        <KpiCard label="Awaiting payment" value={loading ? null : formatCurrency(kpis?.awaitingPayment ?? 0)} icon={<Landmark className="h-4 w-4" />} tone="warn" />
        <KpiCard label="Overdue invoices" value={loading ? null : formatCurrency(kpis?.overdueInvoices ?? 0)} icon={<TrendingDown className="h-4 w-4" />} tone="danger" detail={loading ? null : `${kpis?.overdueInvoiceCount ?? 0} open`} />
        <KpiCard label="Expenses" value={loading ? null : formatCurrency(kpis?.expenses ?? 0)} icon={<Receipt className="h-4 w-4" />} tone="danger" />
        <KpiCard label="Net profit" value={loading ? null : formatCurrency(kpis?.netProfit ?? 0)} icon={<Wallet className="h-4 w-4" />} tone={(kpis?.netProfit ?? 0) >= 0 ? "success" : "danger"} />
        <KpiCard label="Projected net profit" value={loading ? null : formatCurrency(kpis?.projectedNetProfit ?? 0)} icon={<TrendingUp className="h-4 w-4" />} tone="default" />
        <KpiCard label="Collection rate" value={loading ? null : `${Math.round(kpis?.collectionRate ?? 0)}%`} icon={<ArrowUpRight className="h-4 w-4" />} tone="default" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <CollectionsOverviewCard dashboard={dashboard} loading={loading} />
        <StatusOverviewCard dashboard={dashboard} loading={loading} />
      </section>

      <section>
        <Card className="border-border/70">
          <CardHeader className="pb-0">
            <CardTitle>Recent payments</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <RecentPaymentsFeed payments={dashboard?.recentPayments ?? []} loading={loading} />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-border/70">
          <CardHeader className="gap-4 border-b pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Invoice ledger</CardTitle>
              <div className="flex flex-wrap gap-2">
                {INVOICE_FILTERS.map((filter) => (
                  <Button
                    key={filter.id}
                    variant={invoiceFilter === filter.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => onInvoiceFilterChange(filter.id)}
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <InvoiceLedger rows={filteredInvoices} loading={loading} />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-border/70">
          <CardHeader className="pb-0">
            <CardTitle>Monthly trend</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <MonthlyTrendChart trend={dashboard?.trend ?? []} loading={loading} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ExpenseLedger({
  metrics,
  canManage,
  search,
  onSearchChange,
  expenses,
  loading,
  refreshing,
  error,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  totalTrackedExpenses,
}: {
  metrics: FinanceDashboard | undefined;
  canManage: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  expenses: ExpenseRecord[];
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  onAddExpense: () => void;
  onEditExpense: (expense: ExpenseRecord) => void;
  onDeleteExpense: (id: string) => void;
  totalTrackedExpenses: number;
}) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-3">
        <KpiCard label="Expenses this month" value={loading ? null : formatCurrency(metrics?.kpis.expenses ?? 0)} icon={<Receipt className="h-4 w-4" />} tone="danger" />
        <KpiCard label="Net profit" value={loading ? null : formatCurrency(metrics?.kpis.netProfit ?? 0)} icon={<Wallet className="h-4 w-4" />} tone={(metrics?.kpis.netProfit ?? 0) >= 0 ? "success" : "danger"} />
        <KpiCard label="Loaded expenses" value={loading ? null : formatCurrency(totalTrackedExpenses)} icon={<Landmark className="h-4 w-4" />} />
      </section>

      <Card className="border-border/70">
        <CardContent className="p-4 sm:p-5">
          <ListViewToolbar
            search={search}
            onSearchChange={onSearchChange}
            placeholder="Search vendor, category, or description..."
            loading={refreshing}
            resultCount={expenses.length}
            noun="expenses"
            filtersLabel={search.trim() ? `Search: ${search.trim()}` : null}
            onClear={() => onSearchChange("")}
          />

          {error ? (
            <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error instanceof ApiError && (error.status === 401 || error.status === 403)
                ? "Your session no longer has access to expense data."
                : error.message}
            </div>
          ) : null}

          <div className="mt-4 space-y-3 md:hidden">
            {loading
              ? Array.from({ length: 4 }).map((_, index) => (
                  <Card key={index} className="rounded-2xl border-border/70">
                    <CardContent className="space-y-3 p-4">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-24" />
                    </CardContent>
                  </Card>
                ))
              : expenses.length === 0
                ? <EmptyExpenseState canManage={canManage} onAddExpense={onAddExpense} />
                : expenses.map((expense) => (
                    <div key={expense.id} className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{expense.vendor}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{expense.description}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatCurrency(expense.amount)}</span>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <p>{expense.category}</p>
                        <p>{formatDate(expense.expenseDate)}</p>
                        {expense.notes ? <p>{expense.notes}</p> : null}
                      </div>
                      {canManage ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => onEditExpense(expense)}>Edit</Button>
                          <Button size="sm" variant="ghost" className="h-8 px-3 text-xs text-destructive" onClick={() => onDeleteExpense(expense.id)}>Delete</Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
          </div>

          <div className="ios-momentum-x mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vendor</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className={refreshing ? "opacity-60" : ""}>
                {loading
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <tr key={index} className="border-b">
                        <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                        <td className="px-4 py-3"><Skeleton className="ml-auto h-4 w-20" /></td>
                        <td className="px-4 py-3"><Skeleton className="ml-auto h-8 w-24" /></td>
                      </tr>
                    ))
                  : expenses.length === 0
                    ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12">
                          <EmptyExpenseState canManage={canManage} onAddExpense={onAddExpense} />
                        </td>
                      </tr>
                    )
                    : expenses.map((expense) => (
                        <tr key={expense.id} className="border-b transition-colors hover:bg-muted/20">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(expense.expenseDate)}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{expense.vendor}</td>
                          <td className="px-4 py-3 text-muted-foreground">{expense.category}</td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-foreground">{expense.description}</p>
                              {expense.notes ? <p className="mt-1 text-xs text-muted-foreground">{expense.notes}</p> : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{formatCurrency(expense.amount)}</td>
                          <td className="px-4 py-3">
                            {canManage ? (
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onEditExpense(expense)}>Edit</Button>
                                <Button size="sm" variant="ghost" className="h-8 px-3 text-xs text-destructive" onClick={() => onDeleteExpense(expense.id)}>Delete</Button>
                              </div>
                            ) : (
                              <span className="block text-right text-xs text-muted-foreground">Read only</span>
                            )}
                          </td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone = "default",
  detail,
}: {
  label: string;
  value: string | null;
  icon: ReactNode;
  tone?: "default" | "success" | "warn" | "danger";
  detail?: string | null;
}) {
  const toneClass =
    tone === "success" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "danger" ? "text-rose-700" : "text-slate-950";

  return (
    <div className="rounded-[22px] border border-white/80 bg-white/92 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <div className={cn("shrink-0", toneClass)}>{icon}</div>
      </div>
      {value == null ? <Skeleton className="mt-3 h-8 w-24" /> : <p className={cn("mt-2 text-[1.65rem] font-semibold tracking-[-0.04em]", toneClass)}>{value}</p>}
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function CollectionsOverviewCard({ dashboard, loading }: { dashboard: FinanceDashboard | undefined; loading: boolean }) {
  const grossRevenue = dashboard?.kpis.grossRevenue ?? 0;
  const moneyCollected = dashboard?.kpis.moneyCollected ?? 0;
  const awaitingPayment = dashboard?.kpis.awaitingPayment ?? 0;
  const overdue = dashboard?.kpis.overdueInvoices ?? 0;
  const maxValue = Math.max(grossRevenue, moneyCollected, awaitingPayment, overdue, 1);

  const rows = [
    { label: "Gross revenue", value: grossRevenue, tone: "bg-slate-900" },
    { label: "Collected", value: moneyCollected, tone: "bg-emerald-500" },
    { label: "Awaiting", value: awaitingPayment, tone: "bg-amber-500" },
    { label: "Overdue", value: overdue, tone: "bg-rose-500" },
  ] as const;

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-0">
        <CardTitle>Collections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)
          : rows.map((row) => (
              <div key={row.label} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700">{row.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-950">{formatCurrency(row.value)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className={cn("h-full rounded-full", row.tone)} style={{ width: `${Math.max(8, (row.value / maxValue) * 100)}%` }} />
                </div>
              </div>
            ))}
      </CardContent>
    </Card>
  );
}

function StatusOverviewCard({ dashboard, loading }: { dashboard: FinanceDashboard | undefined; loading: boolean }) {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-0">
        <CardTitle>Invoice status</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-5">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)
          : dashboard?.statusBuckets.map((bucket) => (
              <div key={bucket.status} className="rounded-2xl border border-border/70 bg-background/90 p-4">
                <Badge variant="outline" className={cn("capitalize", getStatusBadgeClass(bucket.status))}>
                  {getStatusLabel(bucket.status)}
                </Badge>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{bucket.count}</p>
                <p className="mt-1 text-sm font-medium tabular-nums text-slate-700">{formatCurrency(bucket.totalAmount)}</p>
              </div>
            ))}
      </CardContent>
    </Card>
  );
}

function RecentPaymentsFeed({
  payments,
  loading,
}: {
  payments: FinanceDashboard["recentPayments"];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}
      </div>
    );
  }

  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground">No payments recorded.</p>;
  }

  return (
    <div className="space-y-3">
      {payments.map((payment) => (
        <div key={payment.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/90 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{payment.clientName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {payment.invoiceNumber} · {formatMethod(payment.method)} · {formatDateTime(payment.paidAt)}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-base font-semibold tabular-nums text-emerald-700">{formatCurrency(payment.amount)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function InvoiceLedger({
  rows,
  loading,
}: {
  rows: FinanceDashboard["invoiceRows"];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No invoices in this filter.</p>;
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-border/70 bg-background/90 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{row.clientName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.invoiceNumber}</p>
              </div>
              <Badge variant="outline" className={cn(getStatusBadgeClass(row.status))}>{getStatusLabel(row.status)}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <MetricPair label="Total" value={formatCurrency(row.totalAmount)} />
              <MetricPair label="Paid" value={formatCurrency(row.amountPaid)} />
              <MetricPair label="Balance" value={formatCurrency(row.balanceDue)} />
              <MetricPair label="Due" value={formatDate(row.dueDate)} />
            </div>
          </div>
        ))}
      </div>

      <div className="ios-momentum-x hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Client</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Invoice</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Paid</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Balance</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Due date</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b transition-colors hover:bg-muted/15">
                <td className="px-4 py-3 font-medium text-foreground">{row.clientName}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.invoiceNumber}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{formatCurrency(row.totalAmount)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatCurrency(row.amountPaid)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{formatCurrency(row.balanceDue)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(row.dueDate)}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={cn(getStatusBadgeClass(row.status))}>
                    {getStatusLabel(row.status)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MetricPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-slate-950">{value}</p>
    </div>
  );
}

function MonthlyTrendChart({
  trend,
  loading,
}: {
  trend: FinanceDashboard["trend"];
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-72 w-full" />;
  }

  if (trend.length === 0) {
    return <p className="text-sm text-muted-foreground">No finance history yet.</p>;
  }

  const maxValue = Math.max(1, ...trend.flatMap((entry) => [entry.invoiced, entry.collected, entry.expenses]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <LegendSwatch label="Invoiced" tone="bg-slate-900" />
        <LegendSwatch label="Collected" tone="bg-emerald-500" />
        <LegendSwatch label="Expenses" tone="bg-rose-400" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {trend.map((entry) => (
          <div key={entry.key} className="flex min-h-[220px] flex-col justify-end gap-3 rounded-2xl border border-border/70 bg-background/90 p-3">
            <div className="flex h-40 items-end justify-center gap-2">
              <TrendBar value={entry.invoiced} maxValue={maxValue} tone="bg-slate-900" />
              <TrendBar value={entry.collected} maxValue={maxValue} tone="bg-emerald-500" />
              <TrendBar value={entry.expenses} maxValue={maxValue} tone="bg-rose-400" />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-sm font-semibold text-slate-950">{entry.label}</p>
              <p className="text-[11px] text-muted-foreground">Inv {formatCurrency(entry.invoiced)}</p>
              <p className="text-[11px] text-muted-foreground">Col {formatCurrency(entry.collected)}</p>
              <p className="text-[11px] text-muted-foreground">Exp {formatCurrency(entry.expenses)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendBar({ value, maxValue, tone }: { value: number; maxValue: number; tone: string }) {
  const height = Math.max(8, (Math.max(0, value) / maxValue) * 100);
  return <div className={cn("w-5 rounded-full", tone)} style={{ height: `${height}%` }} />;
}

function LegendSwatch({ label, tone }: { label: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", tone)} />
      <span>{label}</span>
    </div>
  );
}

function EmptyExpenseState({ canManage, onAddExpense }: { canManage: boolean; onAddExpense: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-12 text-center text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <Receipt className="h-8 w-8 opacity-30" />
        <p className="font-medium text-foreground">No expenses logged yet</p>
        {canManage ? (
          <Button variant="outline" className="mt-3" onClick={onAddExpense}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add first expense
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
