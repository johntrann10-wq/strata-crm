import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

export type RevenueDataPoint = {
  label: string;
  revenue: number;
};

export type StatusDataPoint = {
  status: string;
  count: number;
};

export type ServiceDataPoint = {
  name: string;
  count: number;
  revenue: number;
};

const COLORS: Record<string, string> = {
  pending: "#94a3b8",
  scheduled: "#94a3b8",
  confirmed: "#60a5fa",
  "in-progress": "#fb923c",
  in_progress: "#fb923c",
  complete: "#4ade80",
  completed: "#4ade80",
  cancelled: "#f87171",
  "no-show": "#e2e8f0",
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const revenueYAxisFormatter = (value: number): string => {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  }
  return `$${value}`;
};

const RevenueTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm text-sm">
        <p className="font-medium text-gray-700">{label}</p>
        <p className="text-orange-500 font-semibold">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export const RevenueBarChart = ({ data }: { data: RevenueDataPoint[] }) => {
  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            fontSize={12}
            axisLine={false}
            tickLine={false}
            tickFormatter={(label: string) => {
              if (label && /^\d{4}-\d{2}/.test(label)) {
                try {
                  const d = new Date(label + '-01T00:00:00Z');
                  return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(d);
                } catch { return label; }
              }
              return label;
            }}
          />
          <YAxis
            fontSize={12}
            axisLine={false}
            tickLine={false}
            tickFormatter={revenueYAxisFormatter}
          />
          <Tooltip content={<RevenueTooltip />} />
          <Bar dataKey="revenue" fill="#f97316" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const StatusPieChart = ({ data }: { data: StatusDataPoint[] }) => {
  return (
    <div className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="status"
            cx="50%"
            cy="50%"
            outerRadius={80}
            innerRadius={40}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[entry.status] ?? "#cbd5e1"}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any, name: any) => [value, name]}
          />
          <Legend
            iconSize={10}
            iconType="circle"
            formatter={(value: string) => (
              <span style={{ fontSize: 12 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export const TopServicesChart = ({ data }: { data: ServiceDataPoint[] }) => {
  return (
    <div className="w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" fontSize={12} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            fontSize={12}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip />
          <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};