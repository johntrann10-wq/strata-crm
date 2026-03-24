import { useState, useEffect } from "react";
import { Link } from "react-router";
import { AlertTriangle, CheckCircle, Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentLocationId } from "../../lib/auth";

type EntityType = "appointment" | "client" | "invoice" | "quote";
type BannerVariant = "amber" | "blue" | "green" | "red" | "gray";
type IconType = "lightbulb" | "alert" | "check";

interface BannerCta {
  label: string;
  type: "link" | "button";
  href?: string;
  actionKey?: string;
}

interface BannerStep {
  variant: BannerVariant;
  icon: IconType;
  message: string;
  cta?: BannerCta;
}

interface ContextualNextStepProps {
  entityType: EntityType;
  status: string | null | undefined;
  data: Record<string, any>;
  onActionClick?: (action?: string) => void;
}

function computeStep(
  entityType: EntityType,
  status: string | null | undefined,
  data: Record<string, any>
): BannerStep | null {
  const now = new Date();
  const currentLocationId = getCurrentLocationId();
  const withLocation = (path: string) =>
    currentLocationId
      ? `${path}${path.includes("?") ? "&" : "?"}locationId=${encodeURIComponent(currentLocationId)}`
      : path;

  if (entityType === "appointment") {
    if (status === "completed" && !data.invoiceId) {
      return {
        variant: "amber",
        icon: "lightbulb",
        message: "Job complete — no invoice yet. Ready to bill?",
        cta: {
          label: "Create Invoice →",
          type: "link",
          href: `/invoices/new?appointmentId=${data.id}&clientId=${data.clientId}`,
        },
      };
    }

    if (status === "confirmed") {
      const startTime = data.startTime ? new Date(data.startTime) : null;
      if (startTime && startTime <= now) {
        return {
          variant: "blue",
          icon: "lightbulb",
          message: "This job is ready to start.",
          cta: {
            label: "Start Job →",
            type: "button",
            actionKey: "start-job",
          },
        };
      }
    }

    if (status === "scheduled") {
      return {
        variant: "gray",
        icon: "lightbulb",
        message: "This appointment is unconfirmed. Confirm to lock it in.",
        cta: {
          label: "Confirm →",
          type: "button",
          actionKey: "confirm",
        },
      };
    }

    if (status === "in_progress") {
      return {
        variant: "green",
        icon: "check",
        message: "Job in progress. Mark complete when done.",
        cta: {
          label: "Mark Complete →",
          type: "button",
          actionKey: "complete",
        },
      };
    }

    return null;
  }

  if (entityType === "client") {
    const lastDate = data.lastAppointmentDate
      ? new Date(data.lastAppointmentDate)
      : null;
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    if (!lastDate || lastDate < ninetyDaysAgo) {
      return {
        variant: "amber",
        icon: "alert",
        message: "No recent service on record. Book a follow-up appointment.",
        cta: {
          label: "Book Appointment →",
          type: "link",
          href: withLocation(`/appointments/new?clientId=${data.id}`),
        },
      };
    }
    return null;
  }

  if (entityType === "invoice") {
    if (status === "draft") {
      return {
        variant: "blue",
        icon: "lightbulb",
        message: "This invoice is in draft. Send it to the client when ready.",
      };
    }

    if (status === "sent") {
      const dueDate = data.dueDate ? new Date(data.dueDate) : null;
      if (dueDate && dueDate < now) {
        return {
          variant: "red",
          icon: "alert",
          message: "Payment overdue.",
          cta: {
            label: "Record Payment →",
            type: "button",
          },
        };
      }
      return {
        variant: "gray",
        icon: "lightbulb",
        message: "Awaiting payment from client.",
      };
    }

    if (status === "partial") {
      return {
        variant: "amber",
        icon: "alert",
        message: "Partial payment received. Remaining balance due.",
        cta: {
          label: "Record Payment →",
          type: "button",
        },
      };
    }

    return null;
  }

  if (entityType === "quote") {
    if (status === "accepted" && !data.appointmentId) {
      return {
        variant: "green",
        icon: "check",
        message: "Quote accepted! Book the job to get started.",
        cta: {
          label: "Book Appointment →",
          type: "link",
          href: withLocation(`/appointments/new?clientId=${data.clientId}&quoteId=${data.id}`),
        },
      };
    }

    if (status === "sent" && data.sentAt) {
      const sentAt = new Date(data.sentAt);
      const daysDiff = Math.floor(
        (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff > 3) {
        return {
          variant: "amber",
          icon: "alert",
          message: `Sent ${daysDiff} days ago with no response. Consider following up.`,
        };
      }
    }

    if (status === "draft") {
      return {
        variant: "gray",
        icon: "lightbulb",
        message: "This quote is a draft. Send it to the client when ready.",
      };
    }

    return null;
  }

  return null;
}

const variantClasses: Record<BannerVariant, string> = {
  amber: "bg-amber-50 border-amber-200 text-amber-800",
  blue: "bg-blue-50 border-blue-200 text-blue-800",
  green: "bg-green-50 border-green-200 text-green-800",
  red: "bg-red-50 border-red-200 text-red-800",
  gray: "bg-muted border-border text-muted-foreground",
};

function BannerIcon({ icon }: { icon: IconType }) {
  const cls = "h-4 w-4 shrink-0";
  switch (icon) {
    case "alert":
      return <AlertTriangle className={cls} />;
    case "check":
      return <CheckCircle className={cls} />;
    case "lightbulb":
    default:
      return <Lightbulb className={cls} />;
  }
}

export function ContextualNextStep({
  entityType,
  status,
  data,
  onActionClick,
}: ContextualNextStepProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [entityType, status]);

  if (dismissed) return null;

  const step = computeStep(entityType, status, data);
  if (!step) return null;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm border ${variantClasses[step.variant]}`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <BannerIcon icon={step.icon} />
        <span>{step.message}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {step.cta &&
          (step.cta.type === "link" && step.cta.href ? (
            <Button asChild size="sm" variant="outline">
              <Link to={step.cta.href}>{step.cta.label}</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onActionClick?.(step.cta?.actionKey)}>
              {step.cta.label}
            </Button>
          ))}

        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-black/10 transition-colors"
          aria-label="Dismiss"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
