import { useEffect, useState } from "react";
import { useOutletContext } from "react-router";
import { useGlobalAction, useFindFirst } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  TrendingUp,
  Users,
  DollarSign,
  Briefcase,
  BarChart2,
  Star,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RevenueBarChart,
  StatusPieChart,
  TopServicesChart,
  type RevenueDataPoint,
  type StatusDataPoint,
  type ServiceDataPoint,
} from "../components/AnalyticsCharts";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const formatPct = (n: number) => n.toFixed(1) + "%";

interface KpiCard {
  title: string;
  value: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  subtitle: string;
}

export default function AnalyticsPage() {
  const { user } = useOutletContext<AuthOutletContext>();

  const [{ data: business }] = useFindFirst(api.business, {
    filter: { owner: { id: { equals: user.id } } },
    select: { id: true },
  });

  const [dateRange, setDateRange] = useState<string>("6months");

  const [{ data: analyticsData, fetching: fetchingAnalytics }, runGetAnalytics] = useGlobalAction(
    api.getAnalyticsData
  );

  useEffect(() => {
    if (business?.id) void runGetAnalytics({ dateRange } as any);
  }, [business?.id, dateRange]);

  const d = (analyticsData as any) ?? {};

  const kpiCards: KpiCard[] = [
    {
      title: "Repeat Customer Rate",
      value: formatPct(d.repeatCustomerRate ?? 0),
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      subtitle: "Clients with 2+ visits",
    },
    {
      title: "Avg Ticket Value",
      value: formatCurrency(d.avgTicketValue ?? 0),
      icon: DollarSign,
      color: "text-green-500",
      bg: "bg-green-500/10",
      subtitle: "Per completed job",
    },
    {
      title: "Completed This Month",
      value: String(d.completedThisMonth ?? 0),
      icon: Briefcase,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      subtitle: "Jobs completed",
    },
    {
      title: "Total Revenue",
      value: formatCurrency(d.totalRevenueAllTime ?? 0),
      icon: TrendingUp,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      subtitle: "All time",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-row justify-between items-center">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold">Analytics</h1>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30days">Last 30 Days</SelectItem>
            <SelectItem value="3months">Last 3 Months</SelectItem>
            <SelectItem value="6months">Last 6 Months</SelectItem>
            <SelectItem value="12months">Last 12 Months</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading state */}
      {fetchingAnalytics && !analyticsData && (
        <div className="flex flex-col items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">Loading analytics...</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
              <div className={cn("h-8 w-8 rounded-md flex items-center justify-center", card.bg)}>
                <card.icon className={cn("h-4 w-4", card.color)} />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Revenue Trend</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {d.revenueByMonth?.length > 0 ? (
              <RevenueBarChart data={d.revenueByMonth as RevenueDataPoint[]} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No revenue data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Jobs by Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Jobs by Status</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {d.appointmentsByStatus?.length > 0 ? (
              <StatusPieChart data={d.appointmentsByStatus as StatusDataPoint[]} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No appointment data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Services */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Top Services</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {d.topServices?.length > 0 ? (
              <>
                <TopServicesChart data={d.topServices as ServiceDataPoint[]} />
                <div className="mt-3">
                  {(d.topServices as ServiceDataPoint[]).map((service) => (
                    <div
                      key={service.name}
                      className="flex justify-between text-sm py-1.5 border-b last:border-0"
                    >
                      <span>{service.name}</span>
                      <span className="text-muted-foreground">{service.count} jobs</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No service data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Business Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Business Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {[
                { label: "Total Clients", value: String(d.totalClients ?? 0) },
                { label: "Completed Jobs", value: String(d.totalCompletedJobs ?? 0) },
                { label: "Repeat Rate", value: formatPct(d.repeatCustomerRate ?? 0) },
                { label: "Avg Ticket", value: formatCurrency(d.avgTicketValue ?? 0) },
                { label: "Total Revenue", value: formatCurrency(d.totalRevenueAllTime ?? 0) },
              ].map((row) => (
                <div key={row.label} className="flex justify-between py-2.5 border-b last:border-0">
                  <span className="text-sm text-muted-foreground">{row.label}</span>
                  <span className="text-sm font-semibold">{row.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}