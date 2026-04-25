import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { History } from "lucide-react";

export type ActivityRecord = {
  id: string;
  type?: string | null;
  createdAt?: string | Date | null;
  metadata?: string | null;
};

function formatActivityType(value: string | null | undefined) {
  if (!value) return "Activity";
  return value
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatActivityDescription(record: ActivityRecord) {
  if (!record.metadata) return "No additional details.";
  try {
    const parsed = JSON.parse(record.metadata) as Record<string, unknown>;
    if (typeof parsed.body === "string" && parsed.body.trim()) return parsed.body.trim();
    if (typeof parsed.label === "string" && typeof parsed.url === "string") {
      const url = parsed.url.trim();
      if (/^data:image\//i.test(url)) {
        return `${parsed.label.trim() || "Photo"} attached`;
      }
      if (/\.(png|jpe?g|webp|gif|bmp|heic|heif)(\?|#|$)/i.test(url)) {
        return `${parsed.label.trim() || "Photo"} linked`;
      }
      return `${parsed.label}: ${parsed.url}`;
    }
    const parts = Object.entries(parsed)
      .filter(([, value]) => value != null && value !== "")
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${String(value)}`);
    return parts.length > 0 ? parts.join(" | ") : "No additional details.";
  } catch {
    return record.metadata;
  }
}

function formatTimestamp(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityFeedCard({
  title = "Recent Activity",
  records,
  fetching,
}: {
  title?: string;
  records: ActivityRecord[];
  fetching?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {fetching && records.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <History className="h-4 w-4" />
            <span>No activity recorded yet.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div key={record.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{formatActivityType(record.type)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatActivityDescription(record)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatTimestamp(record.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
