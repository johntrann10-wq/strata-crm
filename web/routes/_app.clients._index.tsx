import { useState, useEffect } from "react";
import { Link, useOutletContext } from "react-router";
import { useFindMany } from "../hooks/useApi";
import { api, ApiError } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, UserPlus, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
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

  const isLoading = (!businessId && !clientsError) || (!!businessId && fetchingClients && !clients);
  const isRefetching = fetchingClients && !!clients;

  return (
    <div className="page-content page-section max-w-6xl">
      <PageHeader
        title="Clients"
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              {isRefetching ? (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none animate-spin" />
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              )}
              <Input
                placeholder="Search by name, phone, or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button asChild>
              <Link to="/clients/new">
                <UserPlus className="w-4 h-4 mr-1.5" />
                + Add Client
              </Link>
            </Button>
          </div>
        }
      />

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="border rounded-lg p-4 flex items-center gap-4 bg-white dark:bg-card"
            >
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && clientsError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {clientsError instanceof ApiError && (clientsError.status === 401 || clientsError.status === 403)
            ? "Your session expired. Redirecting to sign-in…"
            : "Could not load clients. Please refresh the page."}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !clientsError && (clients ?? []).length === 0 && (
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
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Add Your First Client
                </Link>
              </Button>
            }
          />
        )
      )}

      {/* Desktop table */}
      {!isLoading && !clientsError && (clients ?? []).length > 0 && (
        <>
          <div className={isRefetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="hidden md:block border rounded-lg overflow-hidden bg-white dark:bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">Phone</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">Since</th>
                </tr>
              </thead>
              <tbody>
                {(clients ?? []).map((client) => (
                  <tr
                    key={client.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/clients/${client.id}`}
                        className="font-semibold hover:underline text-foreground"
                      >
                        {client.firstName} {client.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {client.phone || <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {client.email || <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(new Date(client.createdAt), "MMM d, yyyy")}
                    </td>
                  </tr>
                  ))}
                </tbody>
              </table>
            </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {(clients ?? []).map((client) => (
              <Link
                key={client.id}
                to={`/clients/${client.id}`}
                className="block border rounded-lg p-4 bg-white dark:bg-card shadow-sm hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">
                      {client.firstName} {client.lastName}
                    </p>
                    {client.phone && (
                      <p className="text-sm text-muted-foreground mt-0.5">{client.phone}</p>
                    )}
                    {client.email && (
                      <p className="text-sm text-muted-foreground">{client.email}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {(clients?.length ?? 0) >= pageSize && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={() => setPageSize((p) => p + 25)}
                disabled={fetchingClients}
              >
                {fetchingClients && pageSize > 25 && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Load more clients
              </Button>
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
