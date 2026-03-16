import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CheckCircle, Send, Loader2 } from "lucide-react";
import { Link, useNavigate, useOutletContext } from "react-router";
import type { AuthOutletContext } from "./_app";
import { api } from "../api";
import { useFindMany, useAction } from "../hooks/useApi";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import { StatusBadge } from "../components/shared/StatusBadge";

export default function QuotesIndexPage() {
  const navigate = useNavigate();
  const { businessId } = useOutletContext<AuthOutletContext>();
  const [sendingId, setSendingId] = useState<string | null>(null);

  const lostQuotesFilter = useMemo(() => {
    const thresholdDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    return {
      AND: [
        { status: { in: ["draft", "sent"] } },
        { followUpSentAt: { isSet: false } },
        { createdAt: { lessThan: thresholdDate } },
      ],
    };
  }, []);

  const [{ data: lostQuotes, fetching: lostFetching }, refetchLost] = useFindMany(api.quote, {
    filter: {
      AND: [
        lostQuotesFilter,
        { business: { id: { equals: businessId ?? "" } } },
      ],
    },
    pause: !businessId,
    select: {
      id: true,
      status: true,
      total: true,
      createdAt: true,
      sentAt: true,
      followUpSentAt: true,
      client: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
    sort: { createdAt: "Ascending" },
    first: 50,
  });

  const isFirstLoad = lostFetching && !lostQuotes;
  const isRefetching = lostFetching && !!lostQuotes;

  const [{ data: allQuotes, fetching: allFetching }] = useFindMany(api.quote, {
    filter: businessId ? { business: { id: { equals: businessId } } } : undefined,
    pause: !businessId,
    sort: { createdAt: "Descending" },
    first: 100,
  });
  const [, runSendFollowUp] = useAction(api.quote.sendFollowUp);

  const handleSendFollowUp = async (quoteId: string) => {
    setSendingId(quoteId);
    try {
      const result = await runSendFollowUp({ id: quoteId });
      if (result?.error) {
        toast.error(result.error.message ?? "Failed to send follow-up");
      } else {
        toast.success("Follow-up sent!");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send follow-up");
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

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount == null) return "—";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Quotes"
        actions={
          <Button asChild>
            <Link to="/quotes/new">
              <Plus className="mr-2 h-4 w-4" />
              New Quote
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Quotes</TabsTrigger>
          <TabsTrigger value="lost">
            Lost Quotes
            {lostQuotes && lostQuotes.length > 0 && (
              <span className="ml-1 rounded bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-medium">
                {lostQuotes.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {allFetching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !allQuotes?.length ? (
            <EmptyState title="No quotes" description="Create a quote to get started." />
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(allQuotes as Record<string, unknown>[]).map((record) => {
                    const client = record.client as Record<string, unknown> | undefined;
                    const fullName = [client?.firstName, client?.lastName].filter(Boolean).join(" ") || "—";
                    return (
                      <TableRow
                        key={String(record.id)}
                        className="cursor-pointer"
                        onClick={() => navigate(`/quotes/${record.id}`)}
                      >
                        <TableCell>
                          {record.clientId ? (
                            <Link
                              to={`/clients/${record.clientId}`}
                              className="text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {fullName}
                            </Link>
                          ) : (
                            fullName
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={String(record.status ?? "")} type="quote" />
                        </TableCell>
                        <TableCell>
                          {record.total != null
                            ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(record.total as number)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {record.createdAt
                            ? new Date(record.createdAt as string).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {record.expiresAt
                            ? new Date(record.expiresAt as string).toLocaleDateString()
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="lost">
          {isFirstLoad ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !lostQuotes || lostQuotes.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No lost quotes"
              description="All quotes have been followed up or converted."
            />
          ) : (
            <div className={cn("bg-white border rounded-lg overflow-hidden transition-opacity", isRefetching && "opacity-60")}>
              {lostQuotes.map((quote) => {
                const fullName =
                  [(quote as any).client?.firstName, (quote as any).client?.lastName].filter(Boolean).join(" ") ||
                  "Unknown Client";
                const isLoading = sendingId === quote.id;
                return (
                  <div
                    key={quote.id}
                    className="flex items-center justify-between border-b last:border-0 px-4 py-3"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{fullName}</span>
                      <span className="text-xs text-muted-foreground">
                        {getDaysAgo(quote.createdAt)} · {formatCurrency(quote.total)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={quote.status ?? ''} type="quote" />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sendingId !== null}
                        onClick={() => handleSendFollowUp(quote.id)}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Send className="h-4 w-4 mr-1" />
                        )}
                        Send Follow-up
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