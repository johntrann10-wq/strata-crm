import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate, useOutletContext } from "react-router";
import { format, isSameMonth } from "date-fns";
import { AlertCircle, CalendarClock, CalendarPlus, Ellipsis, Loader2, Mail, MessageSquare, Phone, Search, UserPlus, Users } from "lucide-react";
import { useFindMany } from "../hooks/useApi";
import { api, ApiError } from "../api";
import type { AuthOutletContext } from "./_app";
import { parseLeadRecord } from "../lib/leads";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { triggerImpactFeedback, triggerSelectionFeedback } from "@/lib/nativeInteractions";

type ClientListRecord = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
  notes?: string | null;
};

function normalizePhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

function formatDisplayPhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  const trimmed = value?.trim();
  return trimmed || null;
}

const PRESSABLE_CARD_STYLE: CSSProperties = {
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
  WebkitTapHighlightColor: "transparent",
  userSelect: "none",
  touchAction: "manipulation",
};

function useLongPressActions(onOpen: () => void) {
  const timerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null && typeof window !== "undefined") {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const begin = useCallback((event?: { touches?: ArrayLike<{ clientX: number; clientY: number }> }) => {
    if (typeof window === "undefined") return;
    clearTimer();
    longPressTriggeredRef.current = false;
    const firstTouch = event?.touches?.[0];
    touchStartRef.current = firstTouch ? { x: firstTouch.clientX, y: firstTouch.clientY } : null;
    timerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      void triggerImpactFeedback("medium");
      onOpen();
    }, 420);
  }, [clearTimer, onOpen]);

  const consumeIfLongPress = useCallback(
    (event: { preventDefault(): void; stopPropagation(): void }) => {
      if (longPressTriggeredRef.current) {
        event.preventDefault();
        event.stopPropagation();
        longPressTriggeredRef.current = false;
      }
      clearTimer();
      touchStartRef.current = null;
    },
    [clearTimer]
  );

  const handleTouchMove = useCallback(
    (event: { touches?: ArrayLike<{ clientX: number; clientY: number }> }) => {
      const firstTouch = event.touches?.[0];
      const start = touchStartRef.current;
      if (!firstTouch || !start) return;
      const distance = Math.hypot(firstTouch.clientX - start.x, firstTouch.clientY - start.y);
      if (distance > 10) {
        clearTimer();
        touchStartRef.current = null;
      }
    },
    [clearTimer]
  );

  const openContextMenu = useCallback(
    (event: { preventDefault(): void }) => {
      event.preventDefault();
      longPressTriggeredRef.current = true;
      void triggerImpactFeedback("medium");
      onOpen();
    },
    [onOpen]
  );

  return {
    begin,
    clearTimer,
    consumeIfLongPress,
    handleTouchMove,
    openContextMenu,
  };
}

function MobileClientCard({ client, returnTo }: { client: ClientListRecord; returnTo: string }) {
  const navigate = useNavigate();
  const [actionsOpen, setActionsOpen] = useState(false);
  const normalizedPhone = normalizePhone(client.phone);
  const displayPhone = formatDisplayPhone(client.phone);
  const clientName = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "Unnamed client";
  const clientHref = `/clients/${client.id}?from=${encodeURIComponent(returnTo)}`;
  const newAppointmentHref = `/appointments/new?clientId=${client.id}&from=${encodeURIComponent(returnTo)}`;

  const openActions = useCallback(() => {
    void triggerSelectionFeedback();
    setActionsOpen(true);
  }, []);

  const longPress = useLongPressActions(openActions);

  const openClient = useCallback(() => {
    void triggerSelectionFeedback();
    setActionsOpen(false);
    navigate(clientHref);
  }, [clientHref, navigate]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onClick={openClient}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openClient();
          }
        }}
        onDragStart={(event) => event.preventDefault()}
        onSelectStart={(event) => event.preventDefault()}
        onTouchStart={longPress.begin}
        onTouchEnd={longPress.consumeIfLongPress}
        onTouchCancel={longPress.clearTimer}
        onTouchMove={longPress.handleTouchMove}
        onContextMenu={longPress.openContextMenu}
        className="block select-none rounded-[1.1rem] border bg-card p-4 shadow-sm transition-[transform,background-color] hover:bg-muted/30 active:scale-[0.985] [&_*]:select-none"
        style={PRESSABLE_CARD_STYLE}
        draggable={false}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-none min-w-0">
            <p className="font-semibold text-foreground">{clientName}</p>
            {displayPhone ? <p className="mt-1 text-sm text-muted-foreground">{displayPhone}</p> : null}
            {client.email ? <p className="mt-0.5 text-sm text-muted-foreground">{client.email}</p> : null}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <span className="rounded-full bg-muted/55 px-2 py-1 text-[11px] font-medium text-muted-foreground">Open</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openActions();
              }}
            >
              <Ellipsis className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Client since {format(new Date(client.createdAt), "MMM d, yyyy")}</p>
      </div>

      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-[1.75rem] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>{clientName}</SheetTitle>
            <SheetDescription>Jump into the record or contact this client without hunting through the CRM.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 grid gap-2">
            <Button type="button" variant="outline" className="justify-start" onClick={openClient}>
              <Users className="mr-2 h-4 w-4" />
              Open client
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to={newAppointmentHref} onClick={() => setActionsOpen(false)}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                New appointment
              </Link>
            </Button>
            {normalizedPhone ? (
              <Button asChild variant="outline" className="justify-start">
                <a href={`tel:${normalizedPhone}`} onClick={() => setActionsOpen(false)}>
                  <Phone className="mr-2 h-4 w-4" />
                  Call client
                </a>
              </Button>
            ) : null}
            {normalizedPhone ? (
              <Button asChild variant="outline" className="justify-start">
                <a href={`sms:${normalizedPhone}`} onClick={() => setActionsOpen(false)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Text client
                </a>
              </Button>
            ) : null}
            {client.email ? (
              <Button asChild variant="outline" className="justify-start">
                <a href={`mailto:${client.email}`} onClick={() => setActionsOpen(false)}>
                  <Mail className="mr-2 h-4 w-4" />
                  Email client
                </a>
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default function ClientsPage() {
  const { businessId } = useOutletContext<AuthOutletContext>();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [showMobileStats, setShowMobileStats] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPageSize(25);
  }, [debouncedSearch]);

  const [{ data: clients, fetching: fetchingClients, error: clientsError }] = useFindMany(api.client, {
    search: debouncedSearch || undefined,
    sort: { createdAt: "Descending" },
    first: pageSize,
    pause: !businessId,
  });

  const visibleClients = useMemo(
    () => ((clients ?? []) as ClientListRecord[]).filter((client) => !parseLeadRecord(client.notes).isLead),
    [clients]
  );
  const isLoading = (!businessId && !clientsError) || (!!businessId && fetchingClients && !clients);
  const isRefetching = fetchingClients && !!clients;
  const handleAddClientTap = useCallback(() => {
    void triggerImpactFeedback("light");
  }, []);
  const clientsWithPhone = useMemo(() => visibleClients.filter((client) => Boolean(client.phone)).length, [visibleClients]);
  const clientsWithEmail = useMemo(() => visibleClients.filter((client) => Boolean(client.email)).length, [visibleClients]);
  const newThisMonth = useMemo(
    () => visibleClients.filter((client) => isSameMonth(new Date(client.createdAt), new Date())).length,
    [visibleClients]
  );

  return (
    <div className="page-content page-section max-w-6xl">
      <PageHeader
        title="Clients"
        subtitle="Use the client ledger to manage contact records, communication readiness, and every downstream vehicle, appointment, quote, and invoice."
        right={
          <Button asChild>
            <Link to="/clients/new" onClick={handleAddClientTap}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Add Client
            </Link>
          </Button>
        }
      />

      {!isLoading && !clientsError ? (
        <section className="mb-5 space-y-3">
          <div className="mobile-support-card flex items-center justify-between gap-3 md:hidden">
            <div>
              <p className="text-sm font-semibold text-foreground">{visibleClients.length} visible clients</p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setShowMobileStats((open) => !open)}>
              {showMobileStats ? "Hide details" : "More details"}
            </Button>
          </div>
          <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-4 ${showMobileStats ? "grid" : "hidden md:grid"}`}>
            <div className="surface-panel px-4 py-3 sm:px-5">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Visible clients</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-2xl font-semibold tracking-tight">{visibleClients.length}</p>
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="surface-panel px-4 py-3 sm:px-5">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Phone coverage</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-2xl font-semibold tracking-tight">{clientsWithPhone}</p>
                <Phone className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="surface-panel px-4 py-3 sm:px-5">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Email coverage</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-2xl font-semibold tracking-tight">{clientsWithEmail}</p>
                <Mail className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="surface-panel px-4 py-3 sm:px-5">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">New this month</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-2xl font-semibold tracking-tight">{newThisMonth}</p>
                <CalendarClock className="h-5 w-5 text-primary" />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <ListViewToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by name, phone, or email..."
        loading={isRefetching}
        resultCount={isLoading || clientsError ? null : visibleClients.length}
        noun="clients"
        filtersLabel={debouncedSearch ? `Search: ${debouncedSearch}` : null}
        onClear={search ? () => setSearch("") : undefined}
        className="mb-5"
        actions={
          <Button asChild>
            <Link to="/clients/new" onClick={handleAddClientTap}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Add Client
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 rounded-xl border bg-card p-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && clientsError ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {clientsError instanceof ApiError && (clientsError.status === 401 || clientsError.status === 403)
            ? "Your session expired. Redirecting to sign-in..."
            : "Could not load clients. Please refresh the page."}
        </div>
      ) : null}

      {!isLoading && !clientsError && visibleClients.length === 0 ? (
        search ? (
          <EmptyState
            icon={Search}
            title="No matching clients"
            description="Try adjusting your search to find who you're looking for."
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Start with one real customer. Once a client exists, Strata can hold their vehicles, appointments, invoices, and follow-up history in one place."
            action={
              <Button asChild>
                <Link to="/clients/new" onClick={handleAddClientTap}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Add Your First Client
                </Link>
              </Button>
            }
          />
        )
      ) : null}

      {!isLoading && !clientsError && visibleClients.length > 0 ? (
        <div className={isRefetching ? "transition-opacity opacity-60" : "transition-opacity"}>
          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Phone</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Since</th>
                </tr>
              </thead>
              <tbody>
                {visibleClients.map((client) => (
                  <tr key={client.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        to={`/clients/${client.id}?from=${encodeURIComponent(returnTo)}`}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {client.firstName} {client.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {client.phone || <span className="text-muted-foreground/50">-</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {client.email || <span className="text-muted-foreground/50">-</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{format(new Date(client.createdAt), "MMM d, yyyy")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {visibleClients.map((client) => (
              <MobileClientCard key={client.id} client={client} returnTo={returnTo} />
            ))}
          </div>

          {visibleClients.length >= pageSize ? (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={() => setPageSize((current) => current + 25)} disabled={fetchingClients}>
                {fetchingClients && pageSize > 25 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load more clients
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
