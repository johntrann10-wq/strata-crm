import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { format, isSameMonth } from "date-fns";
import { AlertCircle, CalendarClock, Loader2, Mail, Phone, Search, UserPlus, Users } from "lucide-react";
import { useFindMany } from "../hooks/useApi";
import { api, ApiError } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";

export default function ClientsPage() {
  const { businessId } = useOutletContext<AuthOutletContext>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);

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

  const visibleClients = clients ?? [];
  const isLoading = (!businessId && !clientsError) || (!!businessId && fetchingClients && !clients);
  const isRefetching = fetchingClients && !!clients;
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
        subtitle="Search quickly, review contact coverage, and move into customer records without extra clicks."
        right={
          <Button asChild>
            <Link to="/clients/new">
              <UserPlus className="mr-1.5 h-4 w-4" />
              Add Client
            </Link>
          </Button>
        }
      />

      {!isLoading && !clientsError ? (
        <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="surface-panel px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-muted-foreground">Visible clients</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight">{visibleClients.length}</p>
              <Users className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {debouncedSearch ? "Current search results" : "Most recent CRM records"}
            </p>
          </div>
          <div className="surface-panel px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-muted-foreground">Phone coverage</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight">{clientsWithPhone}</p>
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {visibleClients.length > 0 ? `${Math.round((clientsWithPhone / visibleClients.length) * 100)}% reachable by phone` : "No client records loaded"}
            </p>
          </div>
          <div className="surface-panel px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-muted-foreground">Email coverage</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight">{clientsWithEmail}</p>
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {visibleClients.length > 0 ? `${Math.round((clientsWithEmail / visibleClients.length) * 100)}% ready for quote and invoice sends` : "No client records loaded"}
            </p>
          </div>
          <div className="surface-panel px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-muted-foreground">New this month</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight">{newThisMonth}</p>
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Fresh intake added to the CRM this month</p>
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
        filtersLabel={debouncedSearch ? "search active" : null}
        onClear={search ? () => setSearch("") : undefined}
        className="mb-5"
        actions={
          <Button asChild>
            <Link to="/clients/new">
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
            description="Add your first client to start tracking their vehicles and service history."
            action={
              <Button asChild>
                <Link to="/clients/new">
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
                      <Link to={`/clients/${client.id}`} className="font-semibold text-foreground hover:underline">
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
              <Link
                key={client.id}
                to={`/clients/${client.id}`}
                className="block rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {client.firstName} {client.lastName}
                    </p>
                    {client.phone ? <p className="mt-0.5 text-sm text-muted-foreground">{client.phone}</p> : null}
                    {client.email ? <p className="text-sm text-muted-foreground">{client.email}</p> : null}
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Client since {format(new Date(client.createdAt), "MMM d, yyyy")}</p>
              </Link>
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
