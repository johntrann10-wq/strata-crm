import { useState, useEffect } from "react";
import { useOutletContext } from "react-router";
import { useGlobalAction } from "@gadgetinc/react";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  MapPin,
  Navigation,
  Clock,
  ExternalLink,
  Route,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";

function statusColor(status: string): string {
  switch (status) {
    case "pending":
    case "scheduled":
      return "bg-yellow-100 text-yellow-700";
    case "confirmed":
      return "bg-blue-100 text-blue-700";
    case "in-progress":
    case "in_progress":
      return "bg-orange-100 text-orange-700";
    case "completed":
      return "bg-green-100 text-green-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    case "no-show":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export default function RoutePlannerPage() {
  const _ctx = useOutletContext<AuthOutletContext>();

  const [selectedDate, setSelectedDate] = useState<string>("");

  useEffect(() => {
    setSelectedDate(new Date().toISOString().split("T")[0]);
  }, []);

  const [
    { data: routeData, fetching: fetchingRoute, error: routeError },
    runOptimize,
  ] = useGlobalAction(api.optimizeDailyRoute);

  const stops = (routeData as any)?.stops ?? [];
  const mapsUrl = (routeData as any)?.mapsUrl ?? "";
  const mobileStops = (routeData as any)?.mobileStops ?? 0;
  const shopStops = (routeData as any)?.shopStops ?? 0;

  const handleOptimize = () => {
    void runOptimize({ date: selectedDate });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3 items-center">
          <Route className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold">Route Planner</h1>
        </div>
        {mobileStops > 0 && mapsUrl && (
          <Button asChild>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="h-4 w-4 mr-2" />
              Open Full Route in Maps
            </a>
          </Button>
        )}
      </div>

      {/* Controls Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-1.5">
              <Label>Select Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <Button onClick={handleOptimize} disabled={fetchingRoute}>
              {fetchingRoute ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Route className="h-4 w-4 mr-2" />
              )}
              {fetchingRoute ? "Optimizing..." : "Optimize Route"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {routeError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {routeError.message}
        </div>
      )}

      {/* Empty state */}
      {routeData && stops.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="font-medium">No appointments found</p>
            <p className="text-sm text-muted-foreground">
              No active appointments on this date.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stops list */}
      {stops.length > 0 && (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{stops.length} stops total</span>
            {mobileStops > 0 && <span>{mobileStops} mobile</span>}
            {shopStops > 0 && <span>{shopStops} shop</span>}
          </div>

          {/* Stop cards */}
          <div className="space-y-3">
            {stops.map((stop: any, index: number) => {
              const isMobile = stop.isMobile ?? false;
              return (
                <Card
                  key={stop.id ?? index}
                  className={cn(
                    "border-l-4",
                    isMobile ? "border-l-orange-400" : "border-l-blue-300"
                  )}
                >
                  <CardContent className="pt-4 pb-4">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div
                          className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0",
                            isMobile
                              ? "bg-orange-100 text-orange-700"
                              : "bg-blue-100 text-blue-700"
                          )}
                        >
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">
                            {stop.clientName ?? "Unknown Client"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {[stop.vehicleYear, stop.vehicleMake, stop.vehicleModel]
                              .filter(Boolean)
                              .join(" ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {stop.status && (
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-xs font-medium",
                              statusColor(stop.status)
                            )}
                          >
                            {stop.status}
                          </span>
                        )}
                        {isMobile && stop.mapsLink && (
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={stop.mapsLink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <MapPin className="h-3.5 w-3.5 mr-1" />
                              Directions
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Bottom row */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {stop.startTime && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(stop.startTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                      )}
                      {stop.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span
                            className={cn(
                              isMobile && "text-orange-500 font-medium"
                            )}
                          >
                            {stop.address}
                          </span>
                        </span>
                      )}
                      {stop.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {stop.phone}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}