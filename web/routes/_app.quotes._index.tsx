import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CheckCircle, Search, Send, Loader2, FileText, AlertCircle } from "lucide-react";
import { Link, useNavigate, useOutletContext } from "react-router";
import type { AuthOutletContext } from "./_app";
import { api } from "../api";
import { useFindMany, useAction } from "../hooks/useApi";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import { StatusBadge } from "../components/shared/StatusBadge";

export default function QuotesIndexPage() {
  const navigate = useNavigate();
  const { businessId } = useOutletContext<AuthOutletContext>();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const [{ data: lostQuotes, fetching: lostFetching, error: lostError }, refetchLost] = useFindMany(api.quote, {
    lost: true,
    pause: !businessId,
    sort: { createdAt: "Ascending" },
    first: 50,
  });

  const isFirstLoadLost = lostFetching && lostQuotes === undefined;
  const isRefetchingLost = lostFetching && lostQuotes !== undefined;

  const [{ data: allQuotes, fetching: allFetching, error: allError }] = useFindMany(api.quote, {
    pause: !businessId,
    search: debouncedSearch || undefined,
    sort: { createdAt: "Descending" },
    first: 100,
  });

  const isFirstLoadAll = allFetching && allQuotes === undefined;
  const allRows = Array.isArray(allQuotes) ? allQuotes : [];
  const lostRows = Array.isArray(lostQuotes) ? lostQuotes : [];
  const [, runSendFollowUp] = useAction(api.quote.sendFollowUp);

  const handleSendFollowUp = async (quoteId: string) => {
    setSendingId(quoteId);
    try {
      const result = await runSendFollowUp({ id: quoteId });
      if (result.error) {
        toast.error(result.error.message ?? "Failed to record follow-up");
      } else {
        toast.success("Follow-up recorded");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to record follow-up");
    } finally {
      setSendingId(null);
      refetchLost();
    }
  };

  const getDaysAgo = (date: Date | string) => {
    const diffMs = Date.now() - new Date(date).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  };

  const formatCurrency = (amount: number | string | null | undefined) => {
    if (amount == null || amount === "") return "—";
    const n = Number(amount);
    if (Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Quotes"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              {allFetching ? (
                <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : (
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              )}
              <Input
                placeholder="Search clients, vehicles, quote id..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-72 pl-9"
              />
            </div>
            <Button asChild>
              <Link to="/quotes/new">
                <Plus className="mr-2 h-4 w-4" />
                New Quote
              </Link>
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Quotes</TabsTrigger>
          <TabsTrigger value="lost">
            Lost Quotes
            {lostRows.length > 0 && (
              <span className="ml-1 rounded bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-medium">
                {lostRows.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {allError && !isFirstLoadAll ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Could not load quotes. {allError.message}</span>
            </div>
          ) : isFirstLoadAll ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : allRows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={debouncedSearch ? "No matching quotes" : "No quotes"}
              description={
                debouncedSearch
                  ? "Try a different client name, vehicle, or quote id."
                  : "Create a quote to get started."
              }
            />
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allRows.map((record) => {
                    const row = record as Record<string, any>;
                    const client = row.client as Record<string, any> | undefined;
                    const vehicle = row.vehicle as Record<string, any> | undefined;
                    const fullName = [client?.firstName, client?.lastName].filter(Boolean).join(" ") || "—";
                    const vehicleLabel = vehicle
                      ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
                      : "—";
                    return (
                      <TableRow
                        key={String(row.id)}
                        className="cursor-pointer"
                        onClick={() => navigate(`/quotes/${String(row.id)}`)}
                      >
                        <TableCell>
                          {row.clientId ? (
                            <Link
                              to={`/clients/${String(row.clientId)}`}
                              className="text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {fullName}
                            </Link>
                          ) : (
                            fullName
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{vehicleLabel}</TableCell>
                        <TableCell>
                          <StatusBadge status={String(row.status ?? "")} type="quote" />
                        </TableCell>
                        <TableCell>{formatCurrency(row.total)}</TableCell>
                        <TableCell>{row.createdAt ? new Date(row.createdAt as string).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>{row.expiresAt ? new Date(row.expiresAt as string).toLocaleDateString() : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="lost">
          {lostError && !isFirstLoadLost ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Could not load lost quotes. {lostError.message}</span>
            </div>
          ) : isFirstLoadLost ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : lostRows.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No lost quotes"
              description="All quotes have been followed up or converted."
            />
          ) : (
            <div className={cn("bg-white border rounded-lg overflow-hidden transition-opacity", isRefetchingLost && "opacity-60")}>
              {lostRows.map((quote) => {
                const q = quote as Record<string, any>;
                const client = q.client as Record<string, any> | undefined;
                const fullName = [client?.firstName, client?.lastName].filter(Boolean).join(" ") || "Unknown Client";
                const qid = String(q.id ?? "");
                const isLoading = sendingId === qid;
                return (
                  <div
                    key={qid}
                    className="flex items-center justify-between border-b last:border-0 px-4 py-3"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{fullName}</span>
                      <span className="text-xs text-muted-foreground">
                        {getDaysAgo(q.createdAt as string)} · {formatCurrency(q.total as number | string | null | undefined)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={String(q.status ?? "")} type="quote" />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sendingId !== null}
                        onClick={() => handleSendFollowUp(qid)}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Send className="h-4 w-4 mr-1" />
                        )}
                        Record follow-up
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
