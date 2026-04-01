import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CheckCircle, Search, Send, Loader2, FileText, AlertCircle } from "lucide-react";
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from "react-router";
import type { AuthOutletContext } from "./_app";
import { api } from "../api";
import { useFindMany, useAction } from "../hooks/useApi";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";
import { getTransactionalEmailErrorMessage } from "../lib/transactionalEmail";
import { StatusBadge } from "../components/shared/StatusBadge";

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatFreshness(value: string | null | undefined, label: string): string | null {
  const parsed = safeDate(value);
  return parsed ? `${label} ${parsed.toLocaleDateString()}` : null;
}

function isOlderThanDays(value: string | null | undefined, days: number): boolean {
  const parsed = safeDate(value);
  if (!parsed) return false;
  return Date.now() - parsed.getTime() >= days * 24 * 60 * 60 * 1000;
}

const QUOTE_TABS = ["all", "accepted", "aging", "followup", "lost"] as const;
type QuoteTab = (typeof QUOTE_TABS)[number];

export default function QuotesIndexPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { businessId, currentLocationId } = useOutletContext<AuthOutletContext>();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendingQuoteId, setSendingQuoteId] = useState<string | null>(null);
  const initialSearch = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const activeTab = (QUOTE_TABS as readonly string[]).includes(searchParams.get("tab") ?? "")
    ? (searchParams.get("tab") as QuoteTab)
    : "all";

  useEffect(() => {
    const nextSearch = searchParams.get("q") ?? "";
    if (nextSearch !== search) {
      setSearch(nextSearch);
      setDebouncedSearch(nextSearch);
    }
  }, [searchParams, search]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) {
      next.set("q", debouncedSearch);
    } else {
      next.delete("q");
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [debouncedSearch, searchParams, setSearchParams]);

  const currentQueuePath = `${location.pathname}${location.search}`;
  const linkWithQueueState = (pathname: string) =>
    `${pathname}${pathname.includes("?") ? "&" : "?"}from=${encodeURIComponent(currentQueuePath)}`;

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
  const acceptedRows = allRows.filter((record) => String((record as Record<string, any>).status ?? "") === "accepted");
  const agingRows = allRows.filter((record) => {
    const row = record as Record<string, any>;
    const createdAt = safeDate(String(row.createdAt ?? ""));
    return ["draft", "sent"].includes(String(row.status ?? "")) && !!createdAt && Date.now() - createdAt.getTime() >= 3 * 24 * 60 * 60 * 1000;
  });
  const followUpRows = allRows.filter((record) => {
    const row = record as Record<string, any>;
    const status = String(row.status ?? "");
    if (!["sent", "accepted"].includes(status)) return false;
    const sentAt = (row.sentAt as string | null | undefined) ?? null;
    const followUpSentAt = (row.followUpSentAt as string | null | undefined) ?? null;
    return !safeDate(followUpSentAt)
      ? isOlderThanDays(sentAt, 2)
      : isOlderThanDays(followUpSentAt, 5);
  });
  const [, runSendQuote] = useAction(api.quote.send);
  const [, runSendFollowUp] = useAction(api.quote.sendFollowUp);
  const openPipelineValue = allRows
    .filter((record) => ["draft", "sent", "accepted"].includes(String((record as Record<string, any>).status ?? "")))
    .reduce((sum, record) => sum + Number((record as Record<string, any>).total ?? 0), 0);

  const handleSendQuote = async (quoteId: string) => {
    setSendingQuoteId(quoteId);
    try {
      const result = await runSendQuote({ id: quoteId });
      if (result.error) {
        toast.error(getTransactionalEmailErrorMessage(result.error, "Quote"));
      } else {
        const payload = result.data as { deliveryStatus?: string; deliveryError?: string | null } | undefined;
        if (payload?.deliveryStatus === "emailed") {
          toast.success("Quote emailed to client");
        } else if (payload?.deliveryStatus === "email_failed") {
          toast.warning(`Quote was updated, but email failed${payload.deliveryError ? `: ${payload.deliveryError}` : "."}`);
        } else {
          toast.success("Quote updated");
        }
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send quote");
    } finally {
      setSendingQuoteId(null);
    }
  };

  const handleSendFollowUp = async (quoteId: string) => {
    setSendingId(quoteId);
    try {
      const result = await runSendFollowUp({ id: quoteId });
      if (result.error) {
        toast.error(getTransactionalEmailErrorMessage(result.error, "Quote follow-up"));
      } else {
        const payload = result.data as { deliveryStatus?: string; deliveryError?: string | null } | undefined;
        if (payload?.deliveryStatus === "emailed") {
          toast.success("Follow-up emailed to client");
        } else if (payload?.deliveryStatus === "email_failed") {
          toast.warning(`Follow-up was recorded, but email failed${payload.deliveryError ? `: ${payload.deliveryError}` : "."}`);
        } else {
          toast.success("Follow-up recorded");
        }
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
    <div className="page-content page-section max-w-6xl">
      <PageHeader
        title="Quotes"
        subtitle="Track approvals, revive stalled estimates, and move accepted work into appointments and invoices."
        actions={
          <Button asChild>
            <Link to="/quotes/new">
              <Plus className="mr-2 h-4 w-4" />
              New Quote
            </Link>
          </Button>
        }
      />

      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Open pipeline</p>
            <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-slate-950">{formatCurrency(openPipelineValue)}</p>
          </div>
          <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Ready to book</p>
            <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-slate-950">{acceptedRows.length}</p>
          </div>
          <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Cooling off</p>
            <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-slate-950">{agingRows.length}</p>
          </div>
          <div className="rounded-[22px] border border-white/80 bg-slate-950 px-4 py-4 text-white shadow-[0_18px_45px_rgba(15,23,42,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">Follow-up queue</p>
            <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em]">{followUpRows.length}</p>
          </div>
        </div>
      </section>

      <ListViewToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search clients, vehicles, or quote id..."
        loading={allFetching && allRows.length > 0}
        resultCount={
          activeTab === "accepted"
            ? allRows.filter((record) => String((record as Record<string, any>).status ?? "") === "accepted").length
            : activeTab === "aging"
              ? agingRows.length
              : activeTab === "followup"
                ? followUpRows.length
                : activeTab === "lost"
                  ? lostRows.length
                  : allRows.length
        }
        noun="quotes"
        filtersLabel={
          [
            activeTab !== "all" ? `View: ${activeTab}` : null,
            debouncedSearch ? `Search: ${debouncedSearch}` : null,
          ]
            .filter(Boolean)
            .join(" • ") || null
        }
        onClear={() => {
          setSearch("");
          setDebouncedSearch("");
          const next = new URLSearchParams(searchParams);
          next.delete("q");
          next.set("tab", "all");
          setSearchParams(next, { replace: true });
        }}
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next = new URLSearchParams(searchParams);
          next.set("tab", value);
          setSearchParams(next);
        }}
      >
        <TabsList className="flex w-full gap-2 overflow-x-auto rounded-xl bg-transparent p-0 sm:grid sm:w-auto sm:grid-cols-5 xl:w-full">
          <TabsTrigger value="all" className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">
            All Quotes
          </TabsTrigger>
          <TabsTrigger value="accepted" className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">
            Ready to Book
            {allRows.filter((record) => String((record as Record<string, any>).status ?? "") === "accepted").length > 0 && (
              <span className="ml-1 rounded bg-green-100 text-green-700 px-1.5 py-0.5 text-xs font-medium">
                {allRows.filter((record) => String((record as Record<string, any>).status ?? "") === "accepted").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="aging" className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">
            Aging
            {agingRows.length > 0 && (
              <span className="ml-1 rounded bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-medium">
                {agingRows.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="followup" className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">
            Follow-up
            {followUpRows.length > 0 && (
              <span className="ml-1 rounded bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-medium">
                {followUpRows.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="lost" className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">
            Lost Quotes
            {lostRows.length > 0 && (
              <span className="ml-1 rounded bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-medium">
                {lostRows.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {agingRows.length > 0 ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <FollowupCard
                tone="warn"
                title="Quotes are cooling off"
                detail={`${agingRows.length} quotes are older than 3 days`}
                amount={formatCurrency(agingRows.reduce((sum, quote) => sum + Number((quote as any).total ?? 0), 0))}
                href={`/quotes/${String((agingRows[0] as any).id)}`}
                actionLabel="Open oldest quote"
              />
            </div>
          ) : null}
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
                    <TableHead className="text-right">Actions</TableHead>
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
                    const qid = String(row.id);
                    const quoteStatus = String(row.status ?? "");
                    const canSend = ["draft", "sent"].includes(quoteStatus);
                    const canFollowUp = ["sent"].includes(quoteStatus);
                    const canBook = quoteStatus === "accepted" && !!row.clientId;
                    const canInvoice = quoteStatus === "accepted" && !!row.clientId;
                    const freshness = [
                      formatFreshness((row.sentAt as string | null | undefined) ?? null, "Sent"),
                      formatFreshness((row.followUpSentAt as string | null | undefined) ?? null, "Followed up"),
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const bookHref = canBook
                      ? linkWithQueueState(
                          `/appointments/new?clientId=${String(row.clientId)}&quoteId=${qid}${
                            currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
                          }`
                        )
                      : null;
                    const invoiceHref = canInvoice
                      ? linkWithQueueState(`/invoices/new?clientId=${String(row.clientId)}&quoteId=${qid}`)
                      : null;
                    return (
                      <TableRow
                        key={qid}
                        className={cn("cursor-pointer", agingRows.some((quote) => String((quote as any).id) === qid) && "bg-amber-50/50")}
                        onClick={() => navigate(linkWithQueueState(`/quotes/${qid}`))}
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
                        <TableCell>
                          <div className="space-y-1">
                            <div>{row.createdAt ? new Date(row.createdAt as string).toLocaleDateString() : "—"}</div>
                            {freshness ? <div className="text-xs text-muted-foreground">{freshness}</div> : null}
                          </div>
                        </TableCell>
                        <TableCell>{row.expiresAt ? new Date(row.expiresAt as string).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            {canSend ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                disabled={sendingQuoteId !== null}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleSendQuote(qid);
                                }}
                              >
                                {sendingQuoteId === qid ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : null}
                                {quoteStatus === "draft" ? "Send" : "Resend"}
                              </Button>
                            ) : null}
                            {canFollowUp ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={sendingId !== null}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleSendFollowUp(qid);
                                }}
                              >
                                {sendingId === qid ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Send className="mr-1 h-3.5 w-3.5" />
                                )}
                                Follow up
                              </Button>
                            ) : null}
                            {canBook && bookHref ? (
                              <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                                <Link
                                  to={bookHref}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  Book
                                </Link>
                              </Button>
                            ) : null}
                            {canInvoice && invoiceHref ? (
                              <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                                <Link
                                  to={invoiceHref}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  Invoice
                                </Link>
                              </Button>
                            ) : null}
                            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                              <Link
                                to={linkWithQueueState(`/quotes/${qid}`)}
                                onClick={(event) => event.stopPropagation()}
                              >
                                Open
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="accepted">
          {(() => {
            const acceptedRows = allRows.filter((record) => String((record as Record<string, any>).status ?? "") === "accepted");
            if (acceptedRows.length === 0) {
              return (
                <EmptyState
                  icon={CheckCircle}
                  title="No accepted quotes waiting to book"
                  description="Accepted work will appear here until it is scheduled or invoiced."
                />
              );
            }

            return (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Accepted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acceptedRows.map((record) => {
                      const row = record as Record<string, any>;
                      const client = row.client as Record<string, any> | undefined;
                      const vehicle = row.vehicle as Record<string, any> | undefined;
                      const fullName = [client?.firstName, client?.lastName].filter(Boolean).join(" ") || "—";
                      const vehicleLabel = vehicle
                        ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
                        : "—";
                      const qid = String(row.id);
                      const bookHref = row.clientId
                        ? `/appointments/new?clientId=${String(row.clientId)}&quoteId=${qid}${
                            currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
                          }`
                        : null;
                      const invoiceHref = row.clientId
                        ? `/invoices/new?clientId=${String(row.clientId)}&quoteId=${qid}`
                        : null;
                      return (
                        <TableRow key={qid} className="cursor-pointer bg-green-50/40" onClick={() => navigate(linkWithQueueState(`/quotes/${qid}`))}>
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
                          <TableCell>{formatCurrency(row.total)}</TableCell>
                          <TableCell>{row.acceptedAt ? new Date(row.acceptedAt as string).toLocaleDateString() : "—"}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {bookHref ? (
                                <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                                <Link to={bookHref} onClick={(event) => event.stopPropagation()}>
                                  Book
                                </Link>
                                </Button>
                              ) : null}
                              {invoiceHref ? (
                                <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                                <Link to={invoiceHref} onClick={(event) => event.stopPropagation()}>
                                  Invoice
                                </Link>
                                </Button>
                              ) : null}
                              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                                <Link to={linkWithQueueState(`/quotes/${qid}`)} onClick={(event) => event.stopPropagation()}>
                                  Open
                                </Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="aging">
          {agingRows.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No aging quotes"
              description="No quotes older than 3 days need attention right now."
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
                    <TableHead>Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agingRows.map((record) => {
                    const row = record as Record<string, any>;
                    const client = row.client as Record<string, any> | undefined;
                    const vehicle = row.vehicle as Record<string, any> | undefined;
                    const fullName = [client?.firstName, client?.lastName].filter(Boolean).join(" ") || "—";
                    const vehicleLabel = vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") : "—";
                    const qid = String(row.id);
                    const isLoading = sendingId === qid;
                    const freshness = [
                      formatFreshness((row.sentAt as string | null | undefined) ?? null, "Sent"),
                      formatFreshness((row.followUpSentAt as string | null | undefined) ?? null, "Followed up"),
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <TableRow key={qid} className="cursor-pointer bg-amber-50/50" onClick={() => navigate(linkWithQueueState(`/quotes/${qid}`))}>
                        <TableCell>{row.clientId ? <Link to={`/clients/${String(row.clientId)}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{fullName}</Link> : fullName}</TableCell>
                        <TableCell className="text-muted-foreground">{vehicleLabel}</TableCell>
                        <TableCell><StatusBadge status={String(row.status ?? "")} type="quote" /></TableCell>
                        <TableCell>{formatCurrency(row.total)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div>{row.createdAt ? new Date(row.createdAt as string).toLocaleDateString() : "—"}</div>
                            {freshness ? <div className="text-xs text-muted-foreground">{freshness}</div> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-between gap-2">
                            <span>{getDaysAgo(row.createdAt as string)}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={sendingId !== null}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleSendFollowUp(qid);
                              }}
                            >
                              {isLoading ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="mr-1 h-3.5 w-3.5" />
                              )}
                              Follow up
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="followup">
          {followUpRows.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No stale quote follow-up"
              description="No sent or accepted quotes are waiting on another touch right now."
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
                    <TableHead>Freshness</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {followUpRows.map((record) => {
                    const row = record as Record<string, any>;
                    const client = row.client as Record<string, any> | undefined;
                    const vehicle = row.vehicle as Record<string, any> | undefined;
                    const fullName = [client?.firstName, client?.lastName].filter(Boolean).join(" ") || "—";
                    const vehicleLabel = vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") : "—";
                    const qid = String(row.id);
                    const freshness = [
                      formatFreshness((row.sentAt as string | null | undefined) ?? null, "Sent"),
                      formatFreshness((row.followUpSentAt as string | null | undefined) ?? null, "Followed up"),
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <TableRow key={qid} className="cursor-pointer bg-amber-50/40" onClick={() => navigate(linkWithQueueState(`/quotes/${qid}`))}>
                        <TableCell>{row.clientId ? <Link to={`/clients/${String(row.clientId)}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{fullName}</Link> : fullName}</TableCell>
                        <TableCell className="text-muted-foreground">{vehicleLabel}</TableCell>
                        <TableCell><StatusBadge status={String(row.status ?? "")} type="quote" /></TableCell>
                        <TableCell>{formatCurrency(row.total)}</TableCell>
                        <TableCell className="text-muted-foreground">{freshness || "No outreach recorded"}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={sendingId !== null}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleSendFollowUp(qid);
                              }}
                            >
                              {sendingId === qid ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                              Follow up
                            </Button>
                            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                              <Link to={linkWithQueueState(`/quotes/${qid}`)} onClick={(event) => event.stopPropagation()}>
                                Open
                              </Link>
                            </Button>
                          </div>
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

function FollowupCard({
  title,
  detail,
  amount,
  href,
  actionLabel,
  tone,
}: {
  title: string;
  detail: string;
  amount: string;
  href: string;
  actionLabel: string;
  tone: "warn" | "danger";
}) {
  const toneClass = tone === "danger" ? "border-red-200 bg-red-50/80" : "border-amber-200 bg-amber-50/80";
  return (
    <div className={cn("rounded-lg border p-4", toneClass)}>
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
