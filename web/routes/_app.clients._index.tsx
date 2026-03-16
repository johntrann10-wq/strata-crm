import { useState, useEffect } from "react";
import { Link, useOutletContext } from "react-router";
import { useFindMany } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, UserPlus, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";

const TAG_STYLES: Record<string, string> = {
  vip: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
  fleet:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
  wholesale:
    "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
  retail:
    "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
};

const SOURCE_LABELS: Record<string, string> = {
  "walk-in": "Walk-in",
  referral: "Referral",
  google: "Google",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Website",
  other: "Other",
};

function TagBadge({ tag }: { tag: string }) {
  const style =
    TAG_STYLES[tag] ??
    "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${style}`}
    >
      {tag}
    </span>
  );
}

export default function ClientsPage() {
  const { user, businessId } = useOutletContext<AuthOutletContext>();
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
    filter: (businessId
      ? {
          AND: [
            { business: { id: { equals: businessId } } },
            { deletedAt: { isSet: false } },
          ],
        }
      : undefined) as any,
    sort: { createdAt: "Descending" },
    search: debouncedSearch || undefined,
    first: pageSize,
    select: { id: true, firstName: true, lastName: true, phone: true, email: true, source: true, tags: true, createdAt: true },
    pause: !businessId,
  });

  const isLoading = (!businessId && !clientsError) || (!!businessId && fetchingClients && !clients);
  const isRefetching = fetchingClients && !!clients;

  return (
    <div className="p-6 max-w-6xl mx-auto">
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
          Could not load clients. Please refresh the page.
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
                  <th className="text-left px-4 py-3 font-semibold text-foreground">Source</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">Tags</th>
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
                    <td className="px-4 py-3">
                      {client.source ? (
                        <Badge variant="outline" className="text-xs font-normal">
                          {SOURCE_LABELS[client.source] ?? client.source}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(client.tags) && client.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(client.tags as string[]).map((tag) => (
                              <TagBadge key={tag} tag={tag} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </div>
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
                  {client.source && (
                    <Badge variant="outline" className="text-xs font-normal shrink-0">
                      {SOURCE_LABELS[client.source] ?? client.source}
                    </Badge>
                  )}
                </div>
                {Array.isArray(client.tags) && client.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(client.tags as string[]).map((tag) => (
                      <TagBadge key={tag} tag={tag} />
                    ))}
                  </div>
                )}
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