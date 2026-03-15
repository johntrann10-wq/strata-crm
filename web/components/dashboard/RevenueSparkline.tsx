import { Bar, BarChart, ResponsiveContainer, Tooltip } from "recharts";

interface DataPoint {
  date: string;
  label: string;
  revenue: number;
}

interface RevenueSparklineProps {
  data: DataPoint[];
  fetching: boolean;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DataPoint; value: number }>;
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (active && payload && payload.length > 0) {
    const item = payload[0].payload;
    return (
      <div className="bg-white border border-border rounded shadow-sm px-2 py-1 text-xs">
        <p className="font-medium text-foreground">{item.label}</p>
        <p className="text-muted-foreground">{formatCurrency(item.revenue)}</p>
      </div>
    );
  }
  return null;
};

export const RevenueSparkline = ({ data, fetching }: RevenueSparklineProps) => {
  if (fetching) {
    return <div className="h-full bg-muted animate-pulse rounded" />;
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Bar
            dataKey="revenue"
            radius={[3, 3, 0, 0]}
            fill="hsl(var(--primary))"
            fillOpacity={0.85}
          />
          <Tooltip content={<CustomTooltip />} cursor={false} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-between mt-1">
        {data.map((point, index) => (
          <span key={index} className="text-[10px] text-muted-foreground">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
};