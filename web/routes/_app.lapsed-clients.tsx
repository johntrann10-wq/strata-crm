import { useState, useEffect } from "react";
import { Link, useOutletContext } from "react-router";
import { useFindFirst, useGlobalAction } from "@gadgetinc/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  TrendingDown,
  Mail,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  DollarSign,
  Loader2,
  CalendarPlus,
} from "lucide-react";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";

interface LapsedClient {
  clientId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  marketingOptIn: boolean | null;
  daysSinceLast: number;
  expectedIntervalDays: number;
  overdueRatio: number;
  lastVisitDate: string | null;
  lastServiceLabel: string;
  totalRevenue: number;
  avgJobValue: number;
  revenueAtRisk: number;
  urgency: string;
  recentlyContacted: boolean;
  appointmentCount: number;
}

function getUrgencyStyle(urgency: string): string {
  switch (urgency) {
    case "critical":
      return "bg-red-100 text-red-700 border-red-200";
    case "high":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "medium":
    default:
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
  }
}

export default function LapsedClientsPage() {
  const { user } = useOutletContext<AuthOutletContext>();

  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [isBulkSending, setIsBulkSending] = useState(false);

  const [{ data: businessData }] = useFindFirst(api.business, {
    filter: { owner: { id: { equals: user?.id ?? "" } } },
    select: { id: true, name: true },
  });

  const business = businessData ?? null;

  const [detectResult, runDetect] = useGlobalAction((api as any).detectLapsedClients);
  const [, runSendOutreach] = useGlobalAction((api as any).sendLapsedClientOutreach);

  useEffect(() => {
    if (business?.id) {
      runDetect({ businessId: business.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const detectFetching: boolean = detectResult.fetching;
  const detectError: Error | null = detectResult.error ?? null;
  const lapsedClients: LapsedClient[] = (
    (detectResult.data as any)?.lapsedClients ?? []
  ) as LapsedClient[];

  const totalRevenueAtRisk = lapsedClients.reduce((sum, c) => sum + (c.revenueAtRisk ?? 0), 0);
  const criticalCount = lapsedClients.filter((c) => c.urgency === "critical").length;
  const highCount = lapsedClients.filter((c) => c.urgency === "high").length;
  const mediumCount = lapsedClients.filter((c) => c.urgency === "medium").length;

  const selectableClients = lapsedClients.filter((c) => !c.recentlyContacted);
  const allSelected =
    selectableClients.length > 0 &&
    selectableClients.every((c) => selectedClientIds.has(c.clientId));
  const someSelected = selectableClients.some((c) => selectedClientIds.has(c.clientId));

  const handleSelectAll = (checked: boolean | "indeterminate") => {
    if (checked === true) {
      setSelectedClientIds(new Set(selectableClients.map((c) => c.clientId)));
    } else {
      setSelectedClientIds(new Set());
    }
  };

  const handleToggleClient = (clientId: string, checked: boolean | "indeterminate") => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (checked === true) {
        next.add(clientId);
      } else {
        next.delete(clientId);
      }
      return next;
    });
  };

  const handleSendIndividual = async (clientId: string) => {
    if (!business?.id) return;
    setSendingIds((prev) => new Set([...prev, clientId]));
    try {
      await runSendOutreach({
        businessId: business.id,
        clientIds: JSON.stringify([clientId]),
      });
      toast.success("Sent!");
      await runDetect({ businessId: business.id });
    } catch {
      toast.error("Failed to send email");
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
    }
  };

  const handleBulkSend = async () => {
    if (!business?.id || selectedClientIds.size === 0) return;
    setIsBulkSending(true);
    try {
      await runSendOutreach({
        businessId: business.id,
        clientIds: JSON.stringify([...selectedClientIds]),
      });
      toast.success(
        `Sent to ${selectedClientIds.size} client${selectedClientIds.size !== 1 ? "s" : ""}!`
      );
      setSelectedClientIds(new Set());
      await runDetect({ businessId: business.id });
    } catch {
      toast.error("Failed to send emails");
    } finally {
      setIsBulkSending(false);
    }
  };

  const handleRefresh = () => {
    if (business?.id) {
      runDetect({ businessId: business.id });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl bg-gray-950 text-white p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/10 p-2">
              <TrendingDown className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Missed Revenue Detector</h1>
              <p className="text-gray-400 text-sm">Clients overdue for their next visit</p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="flex items-center gap-1 text-green-400">
                  <DollarSign className="h-5 w-5" />
                  <span className="text-2xl font-bold">{totalRevenueAtRisk.toFixed(2)}</span>
                </div>
                <p className="text-gray-400 text-xs">Potential Revenue at Risk</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-900/30 px-2 py-0.5 text-xs text-red-300">
                  Critical: {criticalCount}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-900/30 px-2 py-0.5 text-xs text-amber-300">
                  High: {highCount}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-400/40 bg-yellow-900/30 px-2 py-0.5 text-xs text-yellow-300">
                  Medium: {mediumCount}
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
              onClick={handleRefresh}
              disabled={detectFetching}
            >
              {detectFetching ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {detectError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{detectError.message}</span>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Toolbar */}
      {!detectError && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={handleSelectAll}
                disabled={detectFetching || selectableClients.length === 0}
              />
              <label
                htmlFor="select-all"
                className="text-sm font-medium cursor-pointer select-none"
              >
                Select all
              </label>
            </div>
            <Button
              size="sm"
              onClick={handleBulkSend}
              disabled={selectedClientIds.size === 0 || isBulkSending || detectFetching}
            >
              {isBulkSending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Mail className="h-4 w-4 mr-1" />
              )}
              Send to Selected ({selectedClientIds.size})
            </Button>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{lapsedClients.length} clients identified</span>
          </div>
        </div>
      )}

      {/* Loading skeletons */}
      {detectFetching && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!detectFetching && !detectError && lapsedClients.length === 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-semibold text-green-800">All caught up!</p>
            <p className="text-sm text-green-700 text-center">
              No lapsed clients detected. Your retention game is strong.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Data tables */}
      {!detectFetching && !detectError && lapsedClients.length > 0 && (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="w-10 px-4 py-3 text-left"></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Last Visit</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Overdue</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Urgency</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">At Risk</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lapsedClients.map((client) => (
                  <tr key={client.clientId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {!client.recentlyContacted && (
                        <Checkbox
                          checked={selectedClientIds.has(client.clientId)}
                          onCheckedChange={(checked) =>
                            handleToggleClient(client.clientId, checked)
                          }
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <Link
                          to={`/clients/${client.clientId}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {client.firstName} {client.lastName}
                        </Link>
                        {client.email && (
                          <p className="text-xs text-gray-500">{client.email}</p>
                        )}
                        {client.phone && (
                          <p className="text-xs text-gray-500">{client.phone}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        {client.lastVisitDate ? (
                          <span className="text-gray-700">
                            {format(new Date(client.lastVisitDate), "MMM d, yyyy")}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                        {client.lastServiceLabel && (
                          <p className="text-xs text-gray-500">{client.lastServiceLabel}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-gray-700">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        <span>{client.daysSinceLast}d</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        expected every {client.expectedIntervalDays}d
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                          getUrgencyStyle(client.urgency)
                        )}
                      >
                        {client.urgency}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      ${client.revenueAtRisk.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      {client.recentlyContacted ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Contacted
                          </span>
                          <Button size="sm" variant="default" asChild>
                            <Link to={`/appointments/new?clientId=${client.clientId}`}>
                              <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                              Book
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendIndividual(client.clientId)}
                            disabled={sendingIds.has(client.clientId) || isBulkSending}
                          >
                            {sendingIds.has(client.clientId) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                              <Mail className="h-3.5 w-3.5 mr-1" />
                            )}
                            Send Email
                          </Button>
                          <Button size="sm" variant="default" asChild>
                            <Link to={`/appointments/new?clientId=${client.clientId}`}>
                              <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                              Book
                            </Link>
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {lapsedClients.map((client) => (
              <Card key={client.clientId} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      {!client.recentlyContacted && (
                        <Checkbox
                          checked={selectedClientIds.has(client.clientId)}
                          onCheckedChange={(checked) =>
                            handleToggleClient(client.clientId, checked)
                          }
                          className="mt-0.5"
                        />
                      )}
                      <div>
                        <Link
                          to={`/clients/${client.clientId}`}
                          className="font-medium text-blue-600 hover:underline text-sm"
                        >
                          {client.firstName} {client.lastName}
                        </Link>
                        {client.email && (
                          <p className="text-xs text-gray-500">{client.email}</p>
                        )}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize shrink-0",
                        getUrgencyStyle(client.urgency)
                      )}
                    >
                      {client.urgency}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      <span>{client.daysSinceLast} days overdue</span>
                    </div>
                    <div className="flex items-center gap-1 font-medium text-gray-800">
                      <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                      <span>{client.revenueAtRisk.toFixed(2)} at risk</span>
                    </div>
                  </div>

                  <div className="pt-1">
                    {client.recentlyContacted ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Recently Contacted
                        </span>
                        <Button size="sm" variant="default" asChild>
                          <Link to={`/appointments/new?clientId=${client.clientId}`}>
                            <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                            Book
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSendIndividual(client.clientId)}
                          disabled={sendingIds.has(client.clientId) || isBulkSending}
                        >
                          {sendingIds.has(client.clientId) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <Mail className="h-3.5 w-3.5 mr-1" />
                          )}
                          Send Email
                        </Button>
                        <Button size="sm" variant="default" asChild>
                          <Link to={`/appointments/new?clientId=${client.clientId}`}>
                            <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                            Book
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}