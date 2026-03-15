import { useEffect } from "react";
import { useParams } from "react-router";
import { useGlobalAction } from "@gadgetinc/react";
import { api } from "../api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  scheduled: "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  "in-progress": "bg-purple-100 text-purple-800 border-purple-200",
  in_progress: "bg-purple-100 text-purple-800 border-purple-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  "no-show": "bg-gray-100 text-gray-800 border-gray-200",
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function PortalSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-900 px-6 py-10">
        <Skeleton className="h-8 w-48 bg-gray-700 mb-2" />
        <Skeleton className="h-5 w-32 bg-gray-700" />
      </div>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-40" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-48" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                {i < 3 && <Separator className="mt-4" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const [{ data, fetching, error }, run] = useGlobalAction(api.generatePortalToken);

  useEffect(() => {
    if (token) {
      void run({ token });
    }
  }, [token]);

  if (fetching) {
    return <PortalSkeleton />;
  }

  if (error || !data || !(data as any).success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CardTitle className="text-gray-700">Link Invalid or Expired</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500">
              This link is invalid or has expired. Please contact us for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const portalData = data as {
    success: boolean;
    clientId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    appointments: Array<{
      id: string;
      title: string | null;
      startTime: string;
      status: string;
      totalPrice: number | null;
      vehicle?: {
        year: number | null;
        make: string;
        model: string;
      } | null;
    }>;
    vehicles: Array<{
      id: string;
      year: number | null;
      make: string;
      model: string;
      color: string | null;
    }>;
  };

  const sortedAppointments = [...(portalData.appointments ?? [])].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 px-6 py-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-white">Your Service Portal</h1>
          <p className="text-gray-300 mt-1 text-lg">
            {portalData.firstName} {portalData.lastName}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto w-full px-4 py-8 space-y-6 flex-1">
        {/* Client Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {portalData.email && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="font-medium w-16">Email</span>
                <span>{portalData.email}</span>
              </div>
            )}
            {portalData.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="font-medium w-16">Phone</span>
                <span>{portalData.phone}</span>
              </div>
            )}
            {!portalData.email && !portalData.phone && (
              <p className="text-sm text-gray-400">No contact information on file.</p>
            )}
          </CardContent>
        </Card>

        {/* Vehicles Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Vehicles</CardTitle>
          </CardHeader>
          <CardContent>
            {portalData.vehicles && portalData.vehicles.length > 0 ? (
              <ul className="space-y-2">
                {portalData.vehicles.map((vehicle, index) => (
                  <li key={vehicle.id}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-800">
                        {vehicle.year ? `${vehicle.year} ` : ""}
                        {vehicle.make} {vehicle.model}
                        {vehicle.color ? (
                          <span className="text-gray-400 ml-1">· {vehicle.color}</span>
                        ) : null}
                      </span>
                    </div>
                    {index < portalData.vehicles.length - 1 && <Separator className="mt-2" />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No vehicles on file.</p>
            )}
          </CardContent>
        </Card>

        {/* Appointment History Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appointment History</CardTitle>
          </CardHeader>
          <CardContent>
            {sortedAppointments.length > 0 ? (
              <ul className="space-y-0">
                {sortedAppointments.map((appt, index) => (
                  <li key={appt.id}>
                    <div className="py-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                              statusColors[appt.status] ?? "bg-gray-100 text-gray-700 border-gray-200"
                            }`}
                          >
                            {appt.status.replace(/-/g, " ")}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {appt.title ?? "Appointment"}
                          </span>
                        </div>
                        {appt.totalPrice != null && (
                          <span className="text-sm font-semibold text-gray-800">
                            {formatCurrency(appt.totalPrice)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        <span>{formatDate(appt.startTime)}</span>
                        {appt.vehicle && (
                          <>
                            <span>·</span>
                            <span>
                              {appt.vehicle.year ? `${appt.vehicle.year} ` : ""}
                              {appt.vehicle.make} {appt.vehicle.model}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {index < sortedAppointments.length - 1 && <Separator />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No appointment history found.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <footer className="text-center py-6 text-sm text-gray-400">
        Powered by <span className="font-semibold text-gray-600">Strata</span>
      </footer>
    </div>
  );
}