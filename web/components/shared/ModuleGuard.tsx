import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Lock } from "lucide-react";

type ModuleGuardProps = {
  module: string;
  enabledModules: Set<string>;
  children: React.ReactNode;
  title?: string;
};

/**
 * Hides content when the given module is not enabled for the business type.
 * Shows a friendly "not available" message and link to dashboard (no broken nav).
 */
export function ModuleGuard({ module, enabledModules, children, title }: ModuleGuardProps) {
  if (enabledModules.has(module)) {
    return <>{children}</>;
  }
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {title ?? "This feature isn’t available for your business type"}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your plan is tailored to your shop. You can enable more features in Settings or switch business type.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild variant="default">
            <Link to="/signed-in">Go to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
