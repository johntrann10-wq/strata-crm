import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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
  totalPrice?: number | null;
  depositAmount?: number | null;
  depositPaid?: boolean | null;
}

export function FinancialSummaryCard({
  totalPrice,
  depositAmount,
  depositPaid,
}: FinancialSummaryCardProps) {
  const showBalanceDue =
    depositPaid === true &&
    totalPrice != null &&
    depositAmount != null;

  const balanceDue = showBalanceDue ? totalPrice! - depositAmount! : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4" />
          Financial Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total Price</span>
          <span className="font-medium">
            {totalPrice != null ? formatCurrency(totalPrice) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Deposit</span>
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {depositAmount != null ? formatCurrency(depositAmount) : "—"}
            </span>
            {depositPaid ? (
              <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100 text-xs">
                Paid
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 text-xs">
                Unpaid
              </Badge>
            )}
          </div>
        </div>
        {showBalanceDue && balanceDue != null && (
          <div className="flex items-center justify-between text-sm pt-1 border-t">
            <span className="text-muted-foreground">Balance Due</span>
            <span className="font-semibold">{formatCurrency(balanceDue)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ReviewRequestCard ───────────────────────────────────────────────────────

interface ReviewRequestCardProps {
  reviewRequestSent?: boolean | null;
  appointmentStatus: string;
  resendingReview: boolean;
  onResendReview: () => void;
}

export function ReviewRequestCard({
  reviewRequestSent,
  appointmentStatus,
  resendingReview,
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
              disabled={resendingReview}
              onClick={onResendReview}
            >
              {resendingReview ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Star className="h-4 w-4 mr-2" />
              )}
              Re-send Review Request
            </Button>
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