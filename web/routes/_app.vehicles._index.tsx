import { useState, useEffect } from "react";
import { Link, useOutletContext } from "react-router";
import { useFindMany, useFindFirst } from "../hooks/useApi";
import { api } from "../api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Loader2, Car } from "lucide-react";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";

type AuthOutletContext = {
  user: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  };
};

const AVATAR_COLORS = [
  "bg-orange-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-rose-500",
  "bg-amber-500",
];

function getMakeColor(make: string): string {
  let hash = 0;
  for (let i = 0; i < make.length; i++) {
    hash = make.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatMileage(mileage: number | null | undefined): string {
  if (mileage == null) return "";
  return mileage.toLocaleString() + " mi";
}

export default function VehiclesPage() {
  const { user } = useOutletContext<AuthOutletContext>();

  const [{ data: businessData, fetching: businessFetching }] = useFindFirst(api.business, {
    filter: { owner: { id: { equals: user?.id ?? "" } } },
    select: { id: true },
    pause: !user?.id,
  } as any);

  const businessId = businessData?.id;

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const isSearching = debouncedQuery.length >= 2;

  const [{ data, fetching, error }] = useFindMany(api.vehicle as any, {
    search: isSearching ? debouncedQuery : undefined,
    first: 50,
    sort: { createdAt: "Descending" },
    pause: !businessId,
  } as any);

  const vehicles = (data as any[]) ?? [];
  const resultCount = vehicles.length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Vehicles"
        badge={
          <Badge variant="secondary" className="text-sm font-medium">
            {isSearching
              ? `${resultCount} ${resultCount === 1 ? "result" : "results"}`
              : "Recent"}
          </Badge>
        }
        right={
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              {fetching ? (
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              ) : (
                <Search className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search make, model, year, plate, color, or owner name…"
              className="pl-9 w-64"
            />
          </div>
        }
      />

      {/* Business Loading Skeleton */}
      {businessFetching && !businessData && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-lg border bg-card p-4"
            >
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !fetching && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Error loading vehicles: {error.message}
        </div>
      )}

      {/* Loading Skeleton */}
      {fetching && !vehicles.length && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-lg border bg-card p-4"
            >
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vehicle Cards */}
      {!fetching && vehicles.length > 0 && (
        <div className="space-y-3">
          {vehicles.map((vehicle: any) => {
            const make = vehicle.make ?? "";
            const avatarColor = getMakeColor(make);
            const initial = make.charAt(0).toUpperCase() || "?";
            const ownerName = vehicle.client
              ? `${vehicle.client.firstName ?? ""} ${vehicle.client.lastName ?? ""}`.trim()
              : null;
            const clientId = vehicle.client?.id;

            const cardInner = (
              <div className="flex items-center gap-4 p-4">
                {/* Avatar */}
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm ${avatarColor}`}
                >
                  {initial}
                </div>

                {/* Center Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">
                  {[vehicle.year, vehicle.make, vehicle.model]
                    .filter(Boolean)
                    .join(" ")}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {[vehicle.color, vehicle.licensePlate]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {ownerName && (
                    <p className="text-xs mt-0.5">
                      <span className="text-primary underline-offset-2 hover:underline">
                        {ownerName}
                      </span>
                    </p>
                  )}
                  {!ownerName && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">
                      No owner on file
                    </p>
                  )}
                </div>

                {/* Right Side */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  {vehicle.mileage != null && (
                    <span className="text-xs text-muted-foreground">
                      {formatMileage(vehicle.mileage)}
                    </span>
                  )}
                </div>
              </div>
            );

            if (clientId) {
              return (
                <div key={vehicle.id} className="rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <Link
                    to={`/clients/${clientId}/vehicles/${vehicle.id}`}
                    className="block"
                  >
                    {cardInner}
                  </Link>
                </div>
              );
            }

            return (
              <div
                key={vehicle.id}
                className="block rounded-lg border bg-card cursor-default"
              >
                {cardInner}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State — searching with no results */}
      {!fetching && !error && vehicles.length === 0 && isSearching && (
        <EmptyState
          icon={Car}
          title="No vehicles found"
          description="Try a different make, model, year, plate, or owner name"
        />
      )}

      {/* Empty State — no query, no vehicles */}
      {!fetching && !error && vehicles.length === 0 && !isSearching && (
        <EmptyState
          icon={Car}
          title="No vehicles on file yet"
          description="Vehicles are added from a client's profile page"
        />
      )}
    </div>
  );
}
