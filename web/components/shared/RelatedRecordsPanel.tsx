import { Link } from "react-router";
import { User, Car, FileText, CalendarClock, Receipt, ClipboardList } from "lucide-react";

export interface RelatedRecord {
  type: "client" | "vehicle" | "invoice" | "appointment" | "job" | "quote";
  id: string;
  label: string;
  sublabel?: string;
  status?: string;
  href: string;
}

export interface RelatedRecordsPanelProps {
  records: RelatedRecord[];
  loading?: boolean;
}

const typeConfig: Record<
  RelatedRecord["type"],
  { icon: React.ElementType; colorClass: string }
> = {
  client: { icon: User, colorClass: "bg-blue-500/10 text-blue-600" },
  vehicle: { icon: Car, colorClass: "bg-purple-500/10 text-purple-600" },
  invoice: { icon: FileText, colorClass: "bg-green-500/10 text-green-600" },
  appointment: { icon: CalendarClock, colorClass: "bg-orange-500/10 text-orange-600" },
  job: { icon: ClipboardList, colorClass: "bg-amber-500/10 text-amber-600" },
  quote: { icon: Receipt, colorClass: "bg-violet-500/10 text-violet-600" },
};

function statusDotColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "paid") return "bg-green-500";
  if (s === "in-progress" || s === "in_progress" || s === "partial") return "bg-orange-500";
  if (s === "cancelled" || s === "void" || s === "no-show") return "bg-red-500";
  if (s === "confirmed" || s === "sent") return "bg-blue-500";
  return "bg-gray-400";
}

export function RelatedRecordsPanel({ records, loading }: RelatedRecordsPanelProps) {
  if (loading) {
    return (
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Related
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg bg-muted h-10 w-32 shrink-0"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!records || records.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Related
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {records.map((record) => {
          const { icon: Icon, colorClass } = typeConfig[record.type];
          return (
            <Link
              key={`${record.type}-${record.id}`}
              to={record.href}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors shrink-0 no-underline"
            >
              <span className={`flex items-center justify-center rounded-md p-1 ${colorClass}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="font-medium leading-none">{record.label}</span>
                {record.sublabel && (
                  <span className="text-xs text-muted-foreground mt-0.5 leading-none">
                    {record.sublabel}
                  </span>
                )}
              </span>
              {record.status && (
                <span
                  className={`inline-block h-2 w-2 rounded-full shrink-0 ${statusDotColor(record.status)}`}
                  title={record.status}
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
