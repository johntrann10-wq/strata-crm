import { useState, useEffect, useRef } from "react";
import { useOutletContext } from "react-router";
import { useFindMany, useGlobalAction } from "../hooks/useApi";
import { api } from "../api";
import { format } from "date-fns";
import {
  ShieldAlert,
  Car,
  Wrench,
  History,
  RotateCcw,
  AlertTriangle,
  Users,
  Search,
  CreditCard,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  Bell,
  Zap,
  RefreshCw,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type AuthOutletContext = {
  user: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  };
  businessId?: string | null;
};

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  try {
    return format(new Date(date as string), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return "—";
  }
}

function truncate(val: unknown, maxLength = 80): string {
  if (val === null || val === undefined) return "—";
  const s = String(val);
  return s.length > maxLength ? s.substring(0, maxLength) + "…" : s;
}

function getBadgeClass(type: string): string {
  if (type.includes("restored") || type.includes("reverted")) {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }
  if (type.startsWith("appointment")) {
    return "bg-blue-100 text-blue-800 border border-blue-200";
  }
  if (type.startsWith("client")) {
    return "bg-green-100 text-green-800 border border-green-200";
  }
  if (type.startsWith("invoice") || type.startsWith("payment")) {
    return "bg-amber-100 text-amber-800 border border-amber-200";
  }
  if (type.startsWith("service")) {
    return "bg-purple-100 text-purple-800 border border-purple-200";
  }
  if (type.startsWith("vehicle")) {
    return "bg-indigo-100 text-indigo-800 border border-indigo-200";
  }
  return "bg-gray-100 text-gray-800 border border-gray-200";
}

function getEntityLabel(entry: {
  client?: { firstName?: string | null; lastName?: string | null } | null;
  invoice?: { invoiceNumber?: string | null } | null;
  vehicle?: { year?: number | null; make?: string | null; model?: string | null } | null;
  appointment?: { id?: string | null; title?: string | null } | null;
  service?: { name?: string | null } | null;
}): string | null {
  if (entry.client?.firstName) {
    return `Client: ${entry.client.firstName} ${entry.client.lastName ?? ""}`.trim();
  }
  if (entry.invoice?.invoiceNumber) {
    return `Invoice: ${entry.invoice.invoiceNumber}`;
  }
  if (entry.vehicle?.make) {
    return `Vehicle: ${[entry.vehicle.year, entry.vehicle.make, entry.vehicle.model].filter(Boolean).join(" ")}`;
  }
  if (entry.appointment?.title) {
    return `Appointment: ${entry.appointment.title}`;
  }
  if (entry.service?.name) {
    return `Service: ${entry.service.name}`;
  }
  return null;
}

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-8 w-20" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
      <Icon className="h-10 w-10 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ─── Archived Clients ────────────────────────────────────────────────────────

function ArchivedClientsSection({ businessId }: { businessId: string | null | undefined }) {
  const [{ data: clients, fetching, error }, refetch] = useFindMany(api.client, {
    filter: {
      businessId: { equals: businessId ?? "" },
      deletedAt: { isSet: true },
    } as any,
    pause: !businessId,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      deletedAt: true,
    },
    first: 50,
  });

  const [{ fetching: restoring }, restoreClient] = useGlobalAction(api.restoreClient);

  const handleRestore = async (id: string) => {
    const result = await restoreClient({ id });
    if ((result as any)?.error) {
      toast.error("Failed to restore client");
    } else {
      toast.success("Client restored");
      refetch();
    }
  };

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Archived On</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {fetching ? (
            <SkeletonRows />
          ) : !clients || clients.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <EmptyState icon={Users} message="No archived clients" />
              </TableCell>
            </TableRow>
          ) : (
            clients.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {c.firstName} {c.lastName}
                </TableCell>
                <TableCell>{c.email ?? "—"}</TableCell>
                <TableCell>{c.phone ?? "—"}</TableCell>
                <TableCell>{formatDate(c.deletedAt)}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoring}
                    onClick={() => handleRestore(c.id)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Restore
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}

// ─── Archived Vehicles ───────────────────────────────────────────────────────

function ArchivedVehiclesSection({ businessId }: { businessId: string | null | undefined }) {
  const [{ data: vehicles, fetching, error }, refetch] = useFindMany(api.vehicle, {
    filter: {
      businessId: { equals: businessId ?? "" },
      deletedAt: { isSet: true },
    } as any,
    pause: !businessId,
    select: {
      id: true,
      year: true,
      make: true,
      model: true,
      vin: true,
      licensePlate: true,
      deletedAt: true,
      client: { firstName: true, lastName: true },
    },
    first: 50,
  });

  const [{ fetching: restoring }, restoreVehicle] = useGlobalAction(api.restoreVehicle);

  const handleRestore = async (id: string) => {
    const result = await restoreVehicle({ id });
    if ((result as any)?.error) {
      toast.error("Failed to restore vehicle");
    } else {
      toast.success("Vehicle restored");
      refetch();
    }
  };

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vehicle</TableHead>
            <TableHead>VIN</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Archived On</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {fetching ? (
            <SkeletonRows />
          ) : !vehicles || vehicles.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <EmptyState icon={Car} message="No archived vehicles" />
              </TableCell>
            </TableRow>
          ) : (
            vehicles.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">
                  {[v.year, v.make, v.model].filter(Boolean).join(" ") || "—"}
                </TableCell>
                <TableCell>{v.vin ?? "—"}</TableCell>
                <TableCell>
                  {v.client
                    ? `${v.client.firstName ?? ""} ${v.client.lastName ?? ""}`.trim()
                    : "—"}
                </TableCell>
                <TableCell>{formatDate(v.deletedAt)}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoring}
                    onClick={() => handleRestore(v.id)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Restore
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}

// ─── Archived Services ───────────────────────────────────────────────────────

function ArchivedServicesSection({ businessId }: { businessId: string | null | undefined }) {
  const [{ data: services, fetching, error }, refetch] = useFindMany(api.service, {
    filter: {
      businessId: { equals: businessId ?? "" },
      deletedAt: { isSet: true },
    } as any,
    pause: !businessId,
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      deletedAt: true,
    },
    first: 50,
  });

  const [{ fetching: restoring }, restoreService] = useGlobalAction(api.restoreService);

  const handleRestore = async (id: string) => {
    const result = await restoreService({ id });
    if ((result as any)?.error) {
      toast.error("Failed to restore service");
    } else {
      toast.success("Service restored");
      refetch();
    }
  };

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Archived On</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {fetching ? (
            <SkeletonRows />
          ) : !services || services.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <EmptyState icon={Wrench} message="No archived services" />
              </TableCell>
            </TableRow>
          ) : (
            services.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="capitalize">{s.category ?? "—"}</TableCell>
                <TableCell>
                  {s.price !== null && s.price !== undefined
                    ? `$${Number(s.price).toFixed(2)}`
                    : "—"}
                </TableCell>
                <TableCell>{formatDate(s.deletedAt)}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoring}
                    onClick={() => handleRestore(s.id)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Restore
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}

// ─── Trash Tab ───────────────────────────────────────────────────────────────

function TrashTab({ userId, businessId }: { userId: string; businessId?: string | null }) {
  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={["clients", "vehicles", "services"]}>
        <AccordionItem value="clients">
          <AccordionTrigger className="text-base font-semibold">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Archived Clients
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <ArchivedClientsSection businessId={businessId} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="vehicles">
          <AccordionTrigger className="text-base font-semibold">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              Archived Vehicles
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <ArchivedVehiclesSection businessId={businessId} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="services">
          <AccordionTrigger className="text-base font-semibold">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Archived Services
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <ArchivedServicesSection businessId={businessId} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

// ─── Voided Invoices Panel ───────────────────────────────────────────────────

function VoidedInvoicesPanel({ businessId }: { businessId: string | null | undefined }) {
  const [selectedInvoice, setSelectedInvoice] = useState<{
    id: string;
    invoiceNumber?: string | null;
  } | null>(null);
  const [reason, setReason] = useState("");

  const [{ data: invoices, fetching, error }, refetch] = useFindMany(api.invoice, {
    filter: {
      businessId: { equals: businessId ?? "" },
      status: { equals: "void" },
    } as any,
    pause: !businessId,
    select: {
      id: true,
      invoiceNumber: true,
      total: true,
      status: true,
      createdAt: true,
      client: { firstName: true, lastName: true },
    },
    sort: { createdAt: "Descending" },
    first: 50,
  });

  const [{ fetching: unvoiding }, unvoidInvoice] = useGlobalAction(api.unvoidInvoice);

  const handleUnvoid = async () => {
    if (!selectedInvoice) return;
    const result = await unvoidInvoice({ id: selectedInvoice.id, reason: reason || undefined });
    if ((result as any)?.error) {
      toast.error("Failed to restore invoice");
    } else {
      toast.success("Invoice restored to draft");
      setSelectedInvoice(null);
      setReason("");
      refetch();
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4" />
        Voided Invoices
      </h3>
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice #</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Voided On</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {fetching ? (
            <SkeletonRows />
          ) : !invoices || invoices.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <EmptyState icon={FileText} message="No voided invoices" />
              </TableCell>
            </TableRow>
          ) : (
            invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.invoiceNumber ?? "—"}</TableCell>
                <TableCell>
                  {inv.client
                    ? `${inv.client.firstName ?? ""} ${inv.client.lastName ?? ""}`.trim()
                    : "—"}
                </TableCell>
                <TableCell>
                  {inv.total !== null && inv.total !== undefined
                    ? `$${Number(inv.total).toFixed(2)}`
                    : "—"}
                </TableCell>
                <TableCell>{formatDate(inv.createdAt)}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelectedInvoice({ id: inv.id, invoiceNumber: inv.invoiceNumber })
                    }
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Un-void
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog
        open={!!selectedInvoice}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedInvoice(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Voided Invoice</DialogTitle>
            <DialogDescription>
              Restore invoice {selectedInvoice?.invoiceNumber ?? ""} to draft status. Provide an
              optional reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="unvoid-reason">Reason (optional)</Label>
            <Textarea
              id="unvoid-reason"
              placeholder="Enter a reason for restoring this invoice…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedInvoice(null)}>
              Cancel
            </Button>
            <Button onClick={handleUnvoid} disabled={unvoiding}>
              {unvoiding ? "Restoring…" : "Restore Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Payment Reversal Panel ──────────────────────────────────────────────────

function PaymentReversalPanel({ businessId }: { businessId: string | null | undefined }) {
  const [selectedPayment, setSelectedPayment] = useState<{
    id: string;
    amount?: number | null;
    invoiceNumber?: string | null;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);

  const [{ data: payments, fetching, error }, refetch] = useFindMany(api.payment, {
    filter: { businessId: { equals: businessId ?? "" } } as any,
    pause: !businessId,
    select: {
      id: true,
      amount: true,
      method: true,
      createdAt: true,
      invoice: { id: true, invoiceNumber: true, status: true },
    },
    sort: { createdAt: "Descending" },
    first: 25,
  });

  const [{ fetching: reversing }, reversePayment] = useGlobalAction(api.reversePayment);

  const handleReverse = async () => {
    if (!selectedPayment) return;
    if (!reason.trim()) {
      setReasonError(true);
      return;
    }
    setReasonError(false);
    const result = await reversePayment({ id: selectedPayment.id, reason });
    if ((result as any)?.error) {
      toast.error("Failed to reverse payment");
    } else {
      toast.success("Payment reversed and invoice status updated");
      setSelectedPayment(null);
      setReason("");
      refetch();
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <CreditCard className="h-4 w-4" />
        Payment Reversal
      </h3>
      <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-900">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 ml-2">
          Reversing a payment permanently removes it and recalculates the invoice balance. This
          action is logged and cannot be undone.
        </AlertDescription>
      </Alert>
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Amount</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Invoice #</TableHead>
            <TableHead>Invoice Status</TableHead>
            <TableHead>Recorded On</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {fetching ? (
            <SkeletonRows count={4} />
          ) : !payments || payments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6}>
                <EmptyState icon={CreditCard} message="No payments found" />
              </TableCell>
            </TableRow>
          ) : (
            payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.amount !== null && p.amount !== undefined
                    ? `$${Number(p.amount).toFixed(2)}`
                    : "—"}
                </TableCell>
                <TableCell className="capitalize">{p.method ?? "—"}</TableCell>
                <TableCell>{p.invoice?.invoiceNumber ?? "—"}</TableCell>
                <TableCell>
                  <Badge className="capitalize">{p.invoice?.status ?? "—"}</Badge>
                </TableCell>
                <TableCell>{formatDate(p.createdAt)}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      setSelectedPayment({
                        id: p.id,
                        amount: p.amount,
                        invoiceNumber: p.invoice?.invoiceNumber,
                      })
                    }
                  >
                    Reverse
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog
        open={!!selectedPayment}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPayment(null);
            setReason("");
            setReasonError(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse Payment</DialogTitle>
            <DialogDescription>
              Reverse payment of{" "}
              {selectedPayment?.amount !== null && selectedPayment?.amount !== undefined
                ? `$${Number(selectedPayment.amount).toFixed(2)}`
                : ""}{" "}
              {selectedPayment?.invoiceNumber
                ? `on invoice ${selectedPayment.invoiceNumber}`
                : ""}
              . A reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reverse-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reverse-reason"
              placeholder="Enter a reason for reversing this payment…"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim()) setReasonError(false);
              }}
              rows={3}
              className={reasonError ? "border-destructive" : ""}
            />
            {reasonError && (
              <p className="text-sm text-destructive">A reason is required.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedPayment(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReverse} disabled={reversing}>
              {reversing ? "Reversing…" : "Reverse Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Invoice Recovery Tab ────────────────────────────────────────────────────

function InvoiceRecoveryTab({ userId, businessId }: { userId: string; businessId?: string | null }) {
  return (
    <div className="space-y-8">
      <VoidedInvoicesPanel businessId={businessId} />
      <Separator />
      <PaymentReversalPanel businessId={businessId} />
    </div>
  );
}

// ─── Audit Trail Tab ─────────────────────────────────────────────────────────

function AuditTrailTab({
  userId,
  businessId,
}: {
  userId: string;
  businessId?: string | null;
}) {
  const [auditSearch, setAuditSearch] = useState("");
  const [allEntries, setAllEntries] = useState<any[]>([]);
  const [afterCursor, setAfterCursor] = useState<string | undefined>(undefined);
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());
  const pendingAppend = useRef(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);

  const filter = businessId ? { businessId: { equals: businessId } } : undefined;

  const [{ data, fetching, error }] = useFindMany(api.activityLog, {
    filter: filter as any,
    sort: { createdAt: "Descending" },
    first: 100,
    after: afterCursor,
    select: {
      id: true,
      type: true,
      description: true,
      metadata: true,
      createdAt: true,
      client: { firstName: true, lastName: true },
      vehicle: { year: true, make: true, model: true },
      appointment: { id: true, title: true },
      invoice: { invoiceNumber: true },
      service: { name: true },
    },
  });

  useEffect(() => {
    if (!fetching && data) {
      const arr = Array.from(data);
      if (pendingAppend.current) {
        setAllEntries((prev) => [...prev, ...arr]);
        pendingAppend.current = false;
      } else {
        setAllEntries(arr);
      }
      setHasNextPage(data.hasNextPage);
      setEndCursor(data.endCursor);
    }
  }, [fetching, data]);

  const handleLoadMore = () => {
    if (endCursor) {
      pendingAppend.current = true;
      setAfterCursor(endCursor);
    }
  };

  const toggleDiff = (id: string) => {
    setExpandedDiffs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredEntries = auditSearch
    ? allEntries.filter(
        (e) =>
          e.description?.toLowerCase().includes(auditSearch.toLowerCase()) ||
          e.type?.toLowerCase().includes(auditSearch.toLowerCase())
      )
    : allEntries;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by description or event type…"
          value={auditSearch}
          onChange={(e) => setAuditSearch(e.target.value)}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {filteredEntries.map((entry) => (
          <div key={entry.id} className="border rounded-lg overflow-hidden">
            <div className="p-4 border-b bg-muted">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {entry.type}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(entry.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {entry.client?.firstName} {entry.client?.lastName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {entry.vehicle?.year} {entry.vehicle?.make} {entry.vehicle?.model}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4">
              <p className="text-sm text-muted-foreground mb-2">
                {entry.description}
              </p>

              {entry.metadata && (
                <div className="space-y-2">
                  {Object.entries(entry.metadata).map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <span className="text-muted-foreground font-medium">
                        {key}:
                      </span>
                      <span className="ml-2">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {entry.appointment && (
              <div className="p-4 border-t">
                <h4 className="text-sm font-medium mb-2">Appointment</h4>
                <p className="text-sm text-muted-foreground">
                  {entry.appointment.title}
                </p>
              </div>
            )}

            {entry.invoice && (
              <div className="p-4 border-t">
                <h4 className="text-sm font-medium mb-2">Invoice</h4>
                <p className="text-sm text-muted-foreground">
                  {entry.invoice.invoiceNumber}
                </p>
              </div>
            )}

            {entry.service && (
              <div className="p-4 border-t">
                <h4 className="text-sm font-medium mb-2">Service</h4>
                <p className="text-sm text-muted-foreground">
                  {entry.service.name}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {hasNextPage && (
        <Button
          onClick={handleLoadMore}
          className="w-full"
          disabled={fetching}
        >
          {fetching ? "Loading more…" : "Load More"}
        </Button>
      )}
    </div>
  );
}

// ─── Revert Edit Tab ─────────────────────────────────────────────────────────

function RevertEditTab({
  userId,
  businessId,
}: {
  userId: string;
  businessId?: string | null;
}) {
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

  const filter = businessId ? { businessId: { equals: businessId } } : undefined;

  const [{ data, fetching, error }] = useFindMany(api.activityLog, {
    filter: filter as any,
    sort: { createdAt: "Descending" },
    first: 50,
    select: {
      id: true,
      type: true,
      description: true,
      metadata: true,
      createdAt: true,
      client: { firstName: true, lastName: true },
      vehicle: { year: true, make: true, model: true },
      appointment: { id: true, title: true },
      invoice: { invoiceNumber: true },
      service: { name: true },
    },
  });

  const [{ fetching: reverting }, revertRecord] = useGlobalAction(api.revertRecord);

  const revertableEntries = (data ? Array.from(data) : []).filter(
    (entry) =>
      entry.metadata &&
      typeof entry.metadata === "object" &&
      !Array.isArray(entry.metadata) &&
      "before" in (entry.metadata as object)
  );

  const handleRevert = async () => {
    if (!selectedEntry) return;
    const result = await revertRecord({ activityLogId: selectedEntry.id });
    if ((result as any)?.error) {
      toast.error("Failed to revert change");
    } else {
      toast.success("Change reverted successfully");
      setSelectedEntry(null);
    }
  };

  return (
    <div className="space-y-4">
      <Alert className="border-amber-300 bg-amber-50 text-amber-900">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 ml-2">
          Reverting replaces the record fields shown with their previous values. This action is
          permanent and will be logged in the audit trail.
        </AlertDescription>
      </Alert>

      {fetching ? (
        <div>
          <Skeleton className="h-32 w-full" />
        </div>
      ) : revertableEntries.length === 0 ? (
        <EmptyState icon={RotateCcw} message="No revertable changes found" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Fields Changed</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {revertableEntries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <Badge className={getBadgeClass(entry.type ?? "")}>{entry.type}</Badge>
                </TableCell>
                <TableCell>{getEntityLabel(entry) ?? "—"}</TableCell>
                <TableCell>
                  {entry.metadata && typeof entry.metadata === "object" && "before" in (entry.metadata as object)
                    ? Object.keys((entry.metadata as any).before).join(", ") || "—"
                    : "—"}
                </TableCell>
                <TableCell>{formatDate(entry.createdAt)}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    Revert
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={!!selectedEntry}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revert This Change?</DialogTitle>
            <DialogDescription>
              {selectedEntry
                ? `Reverting the "${selectedEntry.type}" event${
                    getEntityLabel(selectedEntry) ? ` for ${getEntityLabel(selectedEntry)}` : ""
                  }. The following fields will be restored to their previous values:`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedEntry &&
            selectedEntry.metadata &&
            typeof selectedEntry.metadata === "object" &&
            "before" in (selectedEntry.metadata as object) && (
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                {Object.keys((selectedEntry.metadata as any).before).map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedEntry(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevert} disabled={reverting}>
              {reverting ? "Reverting…" : "Yes, Revert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── System Health Tab ───────────────────────────────────────────────────────

function SystemHealthTab({ userId, businessId }: { userId: string; businessId?: string | null }) {
  // Backend/system-health tables/actions are not implemented yet.
  const SYSTEM_HEALTH_SUPPORTED = false;

  const [{ data: healthData, fetching: healthFetching }, getSystemHealth] = useGlobalAction(
    (api as any).getSystemHealth
  );
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    if (!SYSTEM_HEALTH_SUPPORTED) return;
    void getSystemHealth();
  }, [SYSTEM_HEALTH_SUPPORTED, getSystemHealth]);

  const [{ data: errors, fetching: errorsFetching, error: errorsError }, refetchErrors] =
    useFindMany(api.systemErrorLog, {
      filter: {
        AND: [
          { businessId: { equals: businessId ?? "" } },
          ...(showResolved ? [] : [{ resolved: { equals: false } }]),
        ],
      } as any,
      pause: !businessId || !SYSTEM_HEALTH_SUPPORTED,
      sort: { createdAt: "Descending" },
      first: 50,
      select: {
        id: true,
        severity: true,
        category: true,
        message: true,
        resolved: true,
        resolvedAt: true,
        createdAt: true,
      },
    });

  const [{ fetching: resolving }, markErrorResolved] = useGlobalAction(
    (api as any).markErrorResolved
  );

  const handleResolveError = async (id: string) => {
    const result = await markErrorResolved({ id });
    if ((result as any)?.error) {
      toast.error("Failed to mark error as resolved");
    } else {
      toast.success("Error marked as resolved");
      refetchErrors();
    }
  };

  const [{ data: failedNotifs, fetching: notifsFetching, error: notifsError }, refetchNotifs] =
    useFindMany(api.notificationLog, {
      filter: {
        AND: [
          { businessId: { equals: businessId ?? "" } },
          { status: { equals: "failed" } },
        ],
      } as any,
      pause: !businessId,
      sort: { createdAt: "Descending" },
      first: 50,
      select: {
        id: true,
        type: true,
        recipientEmail: true,
        subject: true,
        retryCount: true,
        errorMessage: true,
        lastAttemptAt: true,
      },
    });

  const [{ fetching: retrying }, retryFailedNotifications] = useGlobalAction(
    api.retryFailedNotifications
  );

  const handleRetryAll = async () => {
    await retryFailedNotifications();
    refetchNotifs();
  };

  const health = healthData as any;

  const statCards = [
    {
      label: "Unresolved Errors",
      value: health?.unresolvedErrors ?? 0,
      alert: (health?.unresolvedErrors ?? 0) > 0,
      alertColor: "border-red-300 text-red-700",
      icon: XCircle,
    },
    {
      label: "Critical",
      value: health?.criticalErrors ?? 0,
      alert: (health?.criticalErrors ?? 0) > 0,
      alertColor: "border-red-300 text-red-700",
      icon: ShieldAlert,
    },
    {
      label: "Failed Notifications",
      value: health?.failedNotifications ?? 0,
      alert: (health?.failedNotifications ?? 0) > 0,
      alertColor: "border-orange-300 text-orange-700",
      icon: Bell,
    },
    {
      label: "Pending Retry",
      value: health?.pendingRetryNotifications ?? 0,
      alert: (health?.pendingRetryNotifications ?? 0) > 0,
      alertColor: "border-yellow-300 text-yellow-700",
      icon: RefreshCw,
    },
    {
      label: "Failed Automations",
      value: health?.failedAutomations ?? 0,
      alert: (health?.failedAutomations ?? 0) > 0,
      alertColor: "border-orange-300 text-orange-700",
      icon: Zap,
    },
    {
      label: "Low Stock",
      value: health?.lowStockItems ?? 0,
      alert: (health?.lowStockItems ?? 0) > 0,
      alertColor: "border-yellow-300 text-yellow-700",
      icon: Activity,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`rounded-lg border p-3 flex flex-col gap-1 ${
                card.alert && !healthFetching
                  ? card.alertColor
                  : "border-border text-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[11px] font-medium uppercase tracking-wide">
                  {card.label}
                </span>
              </div>
              {healthFetching ? (
                <Skeleton className="h-7 w-10 mt-1" />
              ) : (
                <span
                  className={`text-2xl font-bold ${
                    card.alert ? "" : "text-foreground"
                  }`}
                >
                  {card.value}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* System Errors */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            System Errors
          </h3>
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-resolved"
              checked={showResolved}
              onCheckedChange={(v) => setShowResolved(!!v)}
            />
            <Label htmlFor="show-resolved" className="text-sm cursor-pointer">
              Show resolved
            </Label>
          </div>
        </div>

        {errorsError && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{errorsError.message}</AlertDescription>
          </Alert>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {errorsFetching ? (
              <SkeletonRows count={4} />
            ) : !errors || errors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState
                    icon={CheckCircle2}
                    message="No unresolved errors — system is healthy"
                  />
                </TableCell>
              </TableRow>
            ) : (
              errors.map((err) => (
                <TableRow key={err.id}>
                  <TableCell>
                    {err.severity === "critical" ? (
                      <Badge variant="destructive" className="capitalize">
                        {err.severity}
                      </Badge>
                    ) : err.severity === "error" ? (
                      <Badge variant="outline" className="capitalize text-orange-600 border-orange-300">
                        {err.severity}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="capitalize text-yellow-600 border-yellow-300">
                        {err.severity ?? "—"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {err.category ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <span className="text-sm">{truncate(err.message, 80)}</span>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDate(err.createdAt)}
                  </TableCell>
                  <TableCell>
                    {err.resolved ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Resolved
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Open</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!err.resolved && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolving}
                        onClick={() => handleResolveError(err.id)}
                      >
                        Resolve
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Failed Notifications */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Failed Notifications
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRetryAll}
            disabled={retrying || notifsFetching}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${retrying ? "animate-spin" : ""}`} />
            Re-queue All
          </Button>
        </div>

        {notifsError && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{notifsError.message}</AlertDescription>
          </Alert>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Retries</TableHead>
              <TableHead>Last Attempt</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notifsFetching ? (
              <SkeletonRows count={4} />
            ) : !failedNotifs || failedNotifs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState icon={Bell} message="No failed notifications" />
                </TableCell>
              </TableRow>
            ) : (
              failedNotifs.map((notif) => (
                <TableRow key={notif.id}>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize text-xs">
                      {notif.type?.replace(/_/g, " ") ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{notif.recipientEmail ?? "—"}</TableCell>
                  <TableCell className="text-sm max-w-xs">
                    {truncate(notif.subject, 60)}
                  </TableCell>
                  <TableCell className="text-sm">{notif.retryCount ?? 0}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDate(notif.lastAttemptAt)}
                  </TableCell>
                  <TableCell className="text-sm max-w-xs text-destructive">
                    {truncate(notif.errorMessage, 60)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Recovery Page ────────────────────────────────────────────────────────────

export default function RecoveryPage() {
  const { user, businessId } = useOutletContext<AuthOutletContext>();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-primary" />
        <div>
          <h2 className="text-2xl font-bold">Recovery &amp; Audit</h2>
          <p className="text-muted-foreground text-sm">
            Restore deleted records, un-void invoices, reverse payments, and revert edits.
          </p>
        </div>
      </div>

      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            System Health
          </TabsTrigger>
          <TabsTrigger value="trash">Trash</TabsTrigger>
          <TabsTrigger value="invoices">Invoice Recovery</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          <TabsTrigger value="revert">Revert Edit</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4">
          <SystemHealthTab userId={user.id} businessId={businessId} />
        </TabsContent>

        <TabsContent value="trash" className="mt-4">
          <TrashTab userId={user.id} businessId={businessId} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <InvoiceRecoveryTab userId={user.id} businessId={businessId} />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditTrailTab userId={user.id} businessId={businessId} />
        </TabsContent>

        <TabsContent value="revert" className="mt-4">
          <RevertEditTab userId={user.id} businessId={businessId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
