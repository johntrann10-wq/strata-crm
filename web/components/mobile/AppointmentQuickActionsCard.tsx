import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppointmentQuickAction = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
};

type Props = {
  actions: AppointmentQuickAction[];
  loadingKey?: string | null;
  queuedCount?: number;
};

export function AppointmentQuickActionsCard({
  actions,
  loadingKey = null,
  queuedCount = 0,
}: Props) {
  return (
    <Card className="native-panel-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Native quick actions</CardTitle>
            <CardDescription>
              Move the job forward from the phone-friendly action rail instead of digging through full edit forms.
            </CardDescription>
          </div>
          {queuedCount > 0 ? <Badge variant="outline">{queuedCount} queued</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {actions.map((action) => {
          const Icon = action.icon;
          const isLoading = loadingKey === action.key;
          return (
            <Button
              key={action.key}
              type="button"
              variant="outline"
              className={cn(
                "native-touch-surface h-auto min-h-16 justify-start px-4 py-3 text-left",
                action.active && "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-50"
              )}
              onClick={action.onClick}
              disabled={action.disabled || isLoading}
            >
              {isLoading ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{action.label}</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">{action.description}</span>
              </span>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
