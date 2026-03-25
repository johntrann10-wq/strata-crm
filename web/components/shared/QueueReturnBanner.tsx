import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QueueReturnBanner({
  href,
  label = "Back to queue",
}: {
  href: string | null | undefined;
  label?: string;
}) {
  if (!href) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Working from a queue</p>
          <p className="text-xs text-muted-foreground">
            Return to the exact filtered list when you finish here.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
          <Link to={href}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {label}
          </Link>
        </Button>
      </div>
    </div>
  );
}
