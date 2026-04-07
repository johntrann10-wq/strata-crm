import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useOutletContext } from "react-router";
import { DollarSign, Landmark, Loader2, PlusCircle, Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../components/shared/PageHeader";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { api, ApiError } from "../api";
import { useAction, useFindMany, useGlobalAction } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { getPreferredAuthorizedAppPath } from "@/lib/permissionRouting";
import { cn } from "@/lib/utils";

type ExpenseRecord = {
  id: string;
  expenseDate: string;
  vendor: string;
  category: string;
  description: string;
  amount: number | string;
  notes?: string | null;
};

type FinanceMetrics = {
  todayRevenue: number;
  revenueThisMonth: number;
  outstandingBalance: number;
  expensesToday: number;
  expensesThisMonth: number;
  netThisMonth: number;
  expenseCountThisMonth: number;
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
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(DEFAULT_EXPENSE_FORM);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);

  const [{ data: financeMetrics, fetching: metricsFetching, error: metricsError }, runFinanceMetrics] = useGlobalAction(
    api.getFinanceMetrics
  );
  const [{ data: expenses, fetching: expensesFetching, error: expensesError }, refetchExpenses] = useFindMany(api.expense, {
    search: debouncedSearch || undefined,
    sort: { expenseDate: "Descending" } as any,
    first: 100,
    pause: !businessId,
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
    void runFinanceMetrics();
  }, [businessId, runFinanceMetrics]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const expenseRecords = useMemo(() => (expenses ?? []) as ExpenseRecord[], [expenses]);
  const pageError = metricsError ?? expensesError;
  const totalTrackedExpenses = useMemo(
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

    await Promise.all([refetchExpenses(), runFinanceMetrics()]);
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

    await Promise.all([refetchExpenses(), runFinanceMetrics()]);
    setDeleteExpenseId(null);
    toast.success("Expense deleted");
  };

  const isLoading = (metricsFetching && !financeMetrics) || (expensesFetching && !expenses);
  const isRefreshing = (metricsFetching && !!financeMetrics) || (expensesFetching && !!expenses);
  const metrics = financeMetrics as FinanceMetrics | undefined;

  return (
    <>
      <div className="page-content page-section max-w-6xl">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              Finances
              {isRefreshing ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
            </span>
          }
          subtitle="Track collected revenue, unpaid balances, and business spend from one place without letting deposits or open work blur together."
          right={
            canManage ? (
              <Button onClick={openCreateDialog}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Expense
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link to="/invoices">
                  <Receipt className="mr-2 h-4 w-4" />
                  Open invoices
                </Link>
              </Button>
            )
          }
        />

        <section className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.10),transparent_24%),radial-gradient(circle_at_top_right,rgba(239,68,68,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <FinanceMetricCard label="Revenue this month" value={isLoading ? null : formatCurrency(metrics?.revenueThisMonth ?? 0)} icon={<TrendingUp className="h-4 w-4" />} tone="success" />
            <FinanceMetricCard label="Expenses this month" value={isLoading ? null : formatCurrency(metrics?.expensesThisMonth ?? 0)} icon={<TrendingDown className="h-4 w-4" />} tone="danger" />
            <FinanceMetricCard label="Net this month" value={isLoading ? null : formatCurrency(metrics?.netThisMonth ?? 0)} icon={<Wallet className="h-4 w-4" />} tone={(metrics?.netThisMonth ?? 0) >= 0 ? "default" : "danger"} />
            <FinanceMetricCard label="Awaiting collection" value={isLoading ? null : formatCurrency(metrics?.outstandingBalance ?? 0)} icon={<Landmark className="h-4 w-4" />} tone="warn" />
            <FinanceMetricCard label="Expenses logged" value={isLoading ? null : String(metrics?.expenseCountThisMonth ?? 0)} icon={<DollarSign className="h-4 w-4" />} tone="default" compact />
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="border-border/70">
            <CardContent className="p-4 sm:p-5">
              <ListViewToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="Search vendor, category, or description..."
                loading={isRefreshing}
                resultCount={expenseRecords.length}
                noun="expenses"
                filtersLabel={debouncedSearch ? `Search: ${debouncedSearch}` : null}
                onClear={() => {
                  setSearch("");
                  setDebouncedSearch("");
                }}
              />

              {pageError && !isLoading ? (
                <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {pageError instanceof ApiError && (pageError.status === 401 || pageError.status === 403)
                    ? "Your session no longer has access to finance data."
                    : pageError.message}
                </div>
              ) : null}

              <div className="mt-4 space-y-3 md:hidden">
                {isLoading
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <Card key={index} className="rounded-2xl border-border/70">
                        <CardContent className="space-y-3 p-4">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-4 w-24" />
                        </CardContent>
                      </Card>
                    ))
                  : expenseRecords.length === 0
                    ? <EmptyExpenseState canManage={canManage} onAddExpense={openCreateDialog} />
                    : expenseRecords.map((expense) => (
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
                              <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => openEditDialog(expense)}>Edit</Button>
                              <Button size="sm" variant="ghost" className="h-8 px-3 text-xs text-destructive" onClick={() => setDeleteExpenseId(expense.id)}>Delete</Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
              </div>

              <div className="mt-4 hidden overflow-x-auto md:block">
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
                  <tbody className={isRefreshing ? "opacity-60" : ""}>
                    {isLoading
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
                      : expenseRecords.length === 0
                        ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-12">
                              <EmptyExpenseState canManage={canManage} onAddExpense={openCreateDialog} />
                            </td>
                          </tr>
                        )
                        : expenseRecords.map((expense) => (
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
                                    <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => openEditDialog(expense)}>Edit</Button>
                                    <Button size="sm" variant="ghost" className="h-8 px-3 text-xs text-destructive" onClick={() => setDeleteExpenseId(expense.id)}>Delete</Button>
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

          <Card className="border-border/70">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Money pulse</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Keep the shop-side picture honest</h2>
              </div>
              <div className="space-y-3">
                <InsightCard label="Revenue today" value={formatCurrency(metrics?.todayRevenue ?? 0)} detail="Money actually collected against active calendar work today." />
                <InsightCard label="Expenses today" value={formatCurrency(metrics?.expensesToday ?? 0)} detail="Outflow recorded against today's operating spend." />
                <InsightCard label="Tracked expense total" value={formatCurrency(totalTrackedExpenses)} detail="Visible across the currently loaded expense ledger." />
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-sm font-medium text-foreground">What this tab covers</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>Collected revenue from invoices and deposits already taken</li>
                  <li>Awaiting collection across open invoices and uninvoiced appointment balances</li>
                  <li>Logged business expenses with editable notes and categories</li>
                  <li>Net monthly picture without leaving the app</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent
          className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-x-hidden overflow-y-auto p-0 sm:max-w-[560px]"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="p-6">
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
            <DialogDescription>
              Log real business spend so revenue tracking does not look inflated against what the shop is actually spending.
            </DialogDescription>
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
                  className="border-input/90 h-10 w-full min-w-0 appearance-none rounded-xl border bg-background/85 px-3.5 py-2 pr-10 text-sm font-normal shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[color,box-shadow,border-color,background-color] hover:border-border focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/40 [font-variant-numeric:tabular-nums] [color-scheme:light] [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit-fields-wrapper]:min-w-0"
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
              <Textarea id="expense-notes" value={expenseForm.notes} onChange={(event) => setExpenseForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional context, receipt details, or internal note" rows={4} />
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
            <DialogDescription>
              This removes the expense from the ledger and will change the month totals immediately.
            </DialogDescription>
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

function FinanceMetricCard({
  label,
  value,
  detail,
  icon,
  tone,
  compact = false,
}: {
  label: string;
  value: string | null;
  detail?: string;
  icon: ReactNode;
  tone: "default" | "success" | "warn" | "danger";
  compact?: boolean;
}) {
  const toneClass =
    tone === "success" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "danger" ? "text-rose-700" : "text-slate-950";

  return (
    <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <div className={cn("shrink-0", toneClass)}>{icon}</div>
      </div>
      {value == null ? <Skeleton className="mt-3 h-8 w-24" /> : <p className={cn("mt-2 font-semibold tracking-[-0.04em]", compact ? "text-[1.5rem]" : "text-[1.7rem]", toneClass)}>{value}</p>}
      {detail ? <p className="mt-1 min-h-[2.75rem] text-sm leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/95 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyExpenseState({ canManage, onAddExpense }: { canManage: boolean; onAddExpense: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-12 text-center text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <Receipt className="h-8 w-8 opacity-30" />
        <p className="font-medium text-foreground">No expenses logged yet</p>
        <p className="max-w-md text-xs">
          Start tracking shop spend so revenue, outstanding balance, and net performance are grounded in the same place.
        </p>
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
