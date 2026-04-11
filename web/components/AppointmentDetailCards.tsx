import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getDepositSummary } from "@/lib/paymentStates";
import {
  User,
  Car,
  FileText,
  DollarSign,
  Star,
  Phone,
  Mail,
  CheckCircle,
  Loader2,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const statusColorMap: Record<string, string> = {
  // appointment statuses
  scheduled: "bg-amber-100 text-amber-800 border-amber-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  "in-progress": "bg-purple-100 text-purple-800 border-purple-200",
  in_progress: "bg-purple-100 text-purple-800 border-purple-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  "no-show": "bg-gray-100 text-gray-800 border-gray-200",
  // invoice statuses
  draft: "bg-gray-100 text-gray-800 border-gray-200",
  sent: "bg-blue-100 text-blue-800 border-blue-200",
  paid: "bg-green-100 text-green-800 border-green-200",
  partial: "bg-amber-100 text-amber-800 border-amber-200",
  void: "bg-red-100 text-red-800 border-red-200",
};

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const colorClasses = statusColorMap[status] ?? "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        colorClasses
      )}
    >
      {status}
    </span>
  );
}

// ─── ClientCard ─────────────────────────────────────────────────────────────

interface ClientCardProps {
  client?: {
    id?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
}

export function ClientCard({ client }: ClientCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="h-4 w-4" />
          Client
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {client ? (
          <>
            {client.id && (
              <Link
                to={`/clients/${client.id}`}
                className="block font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                {[client.firstName, client.lastName].filter(Boolean).join(" ") || "Unnamed Client"}
              </Link>
            )}
            {!client.id && (
              <span className="font-medium">
                {[client.firstName, client.lastName].filter(Boolean).join(" ") || "Unnamed Client"}
              </span>
            )}
            {client.phone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span>{client.phone}</span>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{client.email}</span>
              </div>
            )}
            <Separator />
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to={client.id ? `/appointments/new?clientId=${client.id}` : "/appointments/new"}>
                New Appointment
              </Link>
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No client data</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── VehicleCard ─────────────────────────────────────────────────────────────

interface VehicleCardProps {
  vehicle?: {
    id?: string | null;
    year?: number | null;
    make?: string | null;
    model?: string | null;
    color?: string | null;
    licensePlate?: string | null;
  } | null;
  clientId?: string | null;
}

export function VehicleCard({ vehicle, clientId }: VehicleCardProps) {
  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Car className="h-4 w-4" />
          Vehicle
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {vehicle ? (
          <>
            {vehicleName && (
              <p className="font-medium text-sm">{vehicleName}</p>
            )}
            {vehicle.color && (
              <p className="text-sm text-muted-foreground">{vehicle.color}</p>
            )}
            {vehicle.licensePlate && (
              <p className="text-sm text-muted-foreground">
                Plate: {vehicle.licensePlate}
              </p>
            )}
            {clientId && (
              <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                <Link to={`/clients/${clientId}`}>View Client Profile</Link>
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No vehicle data</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── InvoiceCard ─────────────────────────────────────────────────────────────

interface InvoiceCardProps {
  invoice?: {
    id?: string | null;
    invoiceNumber?: string | null;
    status?: string | null;
    total?: number | null;
  } | null;
  invoiceFetching: boolean;
  appointmentId: string;
}

export function InvoiceCard({ invoice, invoiceFetching, appointmentId: _appointmentId }: InvoiceCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Invoice
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {invoiceFetching ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : invoice ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {invoice.invoiceNumber && (
                <Badge variant="outline">{invoice.invoiceNumber}</Badge>
              )}
              <StatusBadge status={invoice.status} />
            </div>
            {invoice.total != null && (
              <p className="text-2xl font-bold">{formatCurrency(invoice.total)}</p>
            )}
            {invoice.id && (
              <Button size="sm" className="w-full" asChild>
                <Link to={`/invoices/${invoice.id}`}>View Invoice</Link>
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No invoice yet</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── FinancialSummaryCard ────────────────────────────────────────────────────

interface FinancialSummaryCardProps {
  subtotal?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  applyTax?: boolean | null;
  adminFeeRate?: number | null;
  adminFeeAmount?: number | null;
  applyAdminFee?: boolean | null;
  totalPrice?: number | null;
  depositAmount?: number | null;
  depositPaid?: boolean | null;
  collectedAmount?: number | null;
  balanceDue?: number | null;
  paidInFull?: boolean | null;
  depositSatisfied?: boolean | null;
  depositActionLabel?: string | null;
  onDepositAction?: (() => void) | null;
  depositActionDisabled?: boolean;
  secondaryDepositActionLabel?: string | null;
  onSecondaryDepositAction?: (() => void) | null;
  secondaryDepositActionDisabled?: boolean;
  pricingActionLabel?: string | null;
  onPricingAction?: (() => void) | null;
  pricingActionDisabled?: boolean;
  depositLabels?: {
    rowLabel?: string;
    noun?: string;
    collectedStateLabel?: string;
    requiredStateLabel?: string;
    noCollectionStateLabel?: string;
    noCollectionDetail?: string;
    dueWhenInvoicedDetail?: (totalPrice: number) => string;
    collectedDetail?: (depositAmount: number, remainingBalance: number) => string;
    requiredDetail?: (depositAmount: number, totalPrice: number) => string;
  };
  paymentStateOverride?: {
    rowLabel?: string;
    stateLabel: string;
    detail: string;
    amountLabel?: string | null;
    showRemainingBalance?: boolean;
    remainingBalance?: number | null;
  };
}

export function FinancialSummaryCard({
  subtotal,
  taxRate,
  taxAmount,
  applyTax,
  adminFeeRate,
  adminFeeAmount,
  applyAdminFee,
  totalPrice,
  depositAmount,
  depositPaid,
  collectedAmount,
  balanceDue,
  paidInFull,
  depositSatisfied,
  depositActionLabel,
  onDepositAction,
  depositActionDisabled = false,
  secondaryDepositActionLabel,
  onSecondaryDepositAction,
  secondaryDepositActionDisabled = false,
  pricingActionLabel,
  onPricingAction,
  pricingActionDisabled = false,
  depositLabels,
  paymentStateOverride,
}: FinancialSummaryCardProps) {
  const depositSummary = getDepositSummary({
    totalPrice,
    depositAmount,
    depositPaid,
    collectedAmount,
    balanceDue,
    paidInFull,
    depositSatisfied,
    labels: depositLabels,
  });
  const summaryRowLabel = paymentStateOverride?.rowLabel ?? depositLabels?.rowLabel ?? "Deposit";
  const summaryAmountLabel =
    paymentStateOverride?.amountLabel ?? (depositSummary.hasDeposit ? formatCurrency(depositSummary.depositAmount) : "-");
  const summaryStateLabel = paymentStateOverride?.stateLabel ?? depositSummary.stateLabel;
  const summaryDetail = paymentStateOverride?.detail ?? depositSummary.detail;
  const summaryRemainingBalance =
    paymentStateOverride?.remainingBalance != null ? paymentStateOverride.remainingBalance : depositSummary.remainingBalance;
  const showBalanceDue =
    paymentStateOverride?.showRemainingBalance !== undefined
      ? paymentStateOverride.showRemainingBalance
      : totalPrice != null && depositSummary.remainingBalance > 0;
  const summaryBadgeTone = paymentStateOverride
    ? summaryStateLabel.toLowerCase().includes("paid") ||
      summaryStateLabel.toLowerCase().includes("collected") ||
      summaryStateLabel.toLowerCase().includes("recorded")
      ? "bg-green-100 text-green-800 border-green-200"
      : summaryStateLabel.toLowerCase().includes("due") || summaryStateLabel.toLowerCase().includes("required")
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-slate-100 text-slate-700 border-slate-200"
    : summaryStateLabel.toLowerCase().includes("paid") ||
        summaryStateLabel.toLowerCase().includes("collected") ||
        summaryStateLabel.toLowerCase().includes("recorded")
      ? "bg-green-100 text-green-800 border-green-200"
      : depositSummary.hasDeposit
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4" />
          Financial Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {subtotal != null && subtotal > 0 ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Services subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
        ) : null}
        {applyAdminFee && adminFeeAmount != null && adminFeeAmount > 0 ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Admin fee{adminFeeRate != null && adminFeeRate > 0 ? ` (${adminFeeRate}%)` : ""}
            </span>
            <span className="font-medium">{formatCurrency(adminFeeAmount)}</span>
          </div>
        ) : null}
        {applyTax && taxAmount != null && taxAmount > 0 ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Tax{taxRate != null && taxRate > 0 ? ` (${taxRate}%)` : ""}
            </span>
            <span className="font-medium">{formatCurrency(taxAmount)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total Price</span>
          <span className="font-medium">
            {totalPrice != null ? formatCurrency(totalPrice) : "-"}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{summaryRowLabel}</span>
          <div className="flex items-center gap-2 text-right">
            <span className="font-medium">{summaryAmountLabel}</span>
            <Badge className={cn("text-xs hover:bg-inherit", summaryBadgeTone)}>{summaryStateLabel}</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{summaryDetail}</p>
        {showBalanceDue ? (
          <div className="flex items-center justify-between text-sm pt-1 border-t">
            <span className="text-muted-foreground">Remaining balance</span>
            <span className="font-semibold">{formatCurrency(summaryRemainingBalance)}</span>
          </div>
        ) : null}
        {(pricingActionLabel && onPricingAction) ||
        (depositActionLabel && onDepositAction) ||
        (secondaryDepositActionLabel && onSecondaryDepositAction) ? (
          <div className="flex flex-col gap-2 pt-2">
            {pricingActionLabel && onPricingAction ? (
              <Button size="sm" variant="outline" className="w-full" onClick={onPricingAction} disabled={pricingActionDisabled}>
                {pricingActionLabel}
              </Button>
            ) : null}
            {depositActionLabel && onDepositAction ? (
              <Button size="sm" className="w-full" onClick={onDepositAction} disabled={depositActionDisabled}>
                {depositActionLabel}
              </Button>
            ) : null}
            {secondaryDepositActionLabel && onSecondaryDepositAction ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={onSecondaryDepositAction}
                disabled={secondaryDepositActionDisabled}
              >
                {secondaryDepositActionLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── ReviewRequestCard ───────────────────────────────────────────────────────

interface ReviewRequestCardProps {
  reviewRequestSent?: boolean | null;
  appointmentStatus: string;
  resendingReview: boolean;
  resendEnabled?: boolean;
  onResendReview: () => void;
}

export function ReviewRequestCard({
  reviewRequestSent,
  appointmentStatus,
  resendingReview,
  resendEnabled = true,
  onResendReview,
}: ReviewRequestCardProps) {
  const isCompleted = appointmentStatus === "completed";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-4 w-4" />
          Review Request
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          {reviewRequestSent ? (
            <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100 flex items-center gap-1 w-fit">
              <CheckCircle className="h-3 w-3" />
              Sent
            </Badge>
          ) : (
            <Badge className="bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-100 w-fit">
              Not sent
            </Badge>
          )}
        </div>

        {isCompleted ? (
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!resendEnabled || resendingReview}
              onClick={resendEnabled ? onResendReview : undefined}
            >
              {resendingReview ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Star className="h-4 w-4 mr-2" />
              )}
              Re-send Review Request
            </Button>
            {!resendEnabled && (
              <p className="text-xs text-muted-foreground">
                Review requests are not configured yet in this environment.
              </p>
            )}
            {reviewRequestSent && (
              <p className="text-xs text-muted-foreground">
                A review request was previously sent. Clicking will send another.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Available after job is marked complete.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

