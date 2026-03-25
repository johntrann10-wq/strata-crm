import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useOutletContext } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Car, CalendarClock, Gauge, Loader2, Search, UserRound } from "lucide-react";
import { useFindMany } from "../hooks/useApi";
import { api } from "../api";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";

type AuthOutletContext = {
  businessId: string | null;
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
  for (let index = 0; index < make.length; index += 1) {
    hash = make.charCodeAt(index) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatMileage(mileage: number | null | undefined): string {
  if (mileage == null) return "No mileage";
  return `${mileage.toLocaleString()} mi`;
}

export default function VehiclesPage() {
  const { businessId } = useOutletContext<AuthOutletContext>();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showMobileStats, setShowMobileStats] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const isSearching = debouncedQuery.trim().length >= 2;

  const [{ data, fetching, error }] = useFindMany(api.vehicle as any, {
    search: isSearching ? debouncedQuery : undefined,
    first: 50,
    sort: { createdAt: "Descending" },
    pause: !businessId,
  } as any);

  const vehicles = (data as any[]) ?? [];
  const ownedVehicles = useMemo(() => vehicles.filter((vehicle) => Boolean(vehicle.client?.id)).length, [vehicles]);
  const vehiclesWithMileage = useMemo(() => vehicles.filter((vehicle) => vehicle.mileage != null).length, [vehicles]);
  const newThisMonth = useMemo(() => {
    const now = new Date();
    return vehicles.filter((vehicle) => {
      const createdAt = vehicle.createdAt ? new Date(vehicle.createdAt) : null;
      return createdAt && createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
    }).length;
  }, [vehicles]);

  return (
    <div className="page-content page-section max-w-6xl">
      <PageHeader
        title="Vehicles"
        subtitle="Find the right vehicle fast and jump straight into its owner, history, and next step."
        badge={
          <Badge variant="secondary" className="text-sm font-medium">
            {isSearching ? `${vehicles.length} ${vehicles.length === 1 ? "result" : "results"}` : "Recent"}
          </Badge>
        }
      />

      {!error && businessId ? (
        <section className="mb-5 space-y-3">
          <div className="mobile-support-card flex items-center justify-between gap-3 md:hidden">
            <div>
              <p className="text-sm font-semibold text-foreground">{vehicles.length} visible vehicles</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isSearching ? "Search is active" : "Recent vehicles on file"}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setShowMobileStats((open) => !open)}>
              {showMobileStats ? "Hide details" : "More details"}
            </Button>
          </div>
          <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-4 ${showMobileStats ? "grid" : "hidden md:grid"}`}>
          <div className="surface-panel px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-muted-foreground">Visible vehicles</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight">{vehicles.length}</p>
              <Car className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isSearching ? "Current search results" : "Most recent vehicles on file"}
            </p>
          </div>
          <div className="surface-panel px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-muted-foreground">Assigned owners</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight">{ownedVehicles}</p>
              <UserRound className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {vehicles.length > 0 ? `${Math.round((ownedVehicles / vehicles.length) * 100)}% linked to a client record` : "No vehicles loaded"}
            </p>
          </div>
          <div className="surface-panel px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-muted-foreground">Mileage captured</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight">{vehiclesWithMileage}</p>
              <Gauge className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {vehicles.length > 0 ? `${Math.round((vehiclesWithMileage / vehicles.length) * 100)}% have mileage on file` : "No vehicles loaded"}
            </p>
          </div>
          <div className="surface-panel px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-muted-foreground">New this month</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight">{newThisMonth}</p>
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Fresh vehicle intake added this month</p>
          </div>
          </div>
        </section>
      ) : null}

      <ListViewToolbar
        search={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search make, model, year, plate, color, or owner name..."
        loading={fetching}
        resultCount={!error && businessId ? vehicles.length : null}
        noun="vehicles"
        filtersLabel={isSearching ? "search active" : null}
        onClear={searchQuery ? () => setSearchQuery("") : undefined}
        className="mb-5"
      />

      {!businessId ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 rounded-xl border bg-card p-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
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
      ) : null}

      {error && !fetching ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Error loading vehicles: {error.message}
        </div>
      ) : null}

      {fetching && !vehicles.length ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 rounded-xl border bg-card p-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
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
      ) : null}

      {!fetching && vehicles.length > 0 ? (
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
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColor}`}
                >
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-sm">
                    {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[vehicle.color, vehicle.licensePlate].filter(Boolean).join(" • ")}
                  </p>
                  {ownerName ? (
                    <p className="mt-0.5 text-xs text-primary">{ownerName}</p>
                  ) : (
                    <p className="mt-0.5 text-xs italic text-muted-foreground">No owner on file</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-xs text-muted-foreground">{formatMileage(vehicle.mileage)}</span>
                </div>
              </div>
            );

            return clientId ? (
              <div key={vehicle.id} className="rounded-[1.1rem] border bg-card transition-colors hover:bg-accent/40">
                <Link to={`/clients/${clientId}/vehicles/${vehicle.id}?from=${encodeURIComponent(returnTo)}`} className="block">
                  {cardInner}
                </Link>
              </div>
            ) : (
              <div key={vehicle.id} className="rounded-[1.1rem] border bg-card">
                {cardInner}
              </div>
            );
          })}
        </div>
      ) : null}

      {!fetching && !error && vehicles.length === 0 && isSearching ? (
        <EmptyState
          icon={Car}
          title="No vehicles found"
          description="Try a different make, model, year, plate, or owner name."
        />
      ) : null}

      {!fetching && !error && vehicles.length === 0 && !isSearching ? (
        <EmptyState
          icon={Car}
          title="No vehicles on file yet"
          description="Vehicles are added from a client's profile page."
          action={
            <Button asChild variant="outline">
              <Link to="/clients">Open clients</Link>
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
