import { useEffect, useMemo, useState } from "react";
import { Mail, Loader2, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ActivityRecord = {
  id: string;
  type?: string | null;
  createdAt?: string | Date | null;
  metadata?: string | null;
};

type Props = {
  title: string;
  recipientName?: string | null;
  recipient?: string | null;
  primaryLabel: string;
  activities: ActivityRecord[];
  sending?: boolean;
  canSend?: boolean;
  onPrimarySend: (payload?: { message?: string; recipientEmail?: string; recipientName?: string }) => Promise<{ error?: { message?: string } } | void>;
};

function parseMeta(record: ActivityRecord): { recipient?: string; message?: string; deliveryStatus?: string; deliveryError?: string } {
  try {
    return record.metadata ? JSON.parse(record.metadata) : {};
  } catch {
    return {};
  }
}

function formatWhen(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDeliveryStatus(status: string | undefined) {
  switch (status) {
    case "emailed":
      return "Emailed";
    case "smtp_disabled":
      return "Recorded only";
    case "missing_email":
      return "Missing recipient email";
    case "email_failed":
      return "Email failed";
    default:
      return "Recorded";
  }
}

function deliveryTone(status: string | undefined) {
  switch (status) {
    case "emailed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "smtp_disabled":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "missing_email":
    case "email_failed":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function CommunicationCard({
  title,
  recipientName,
  recipient,
  primaryLabel,
  activities,
  sending,
  canSend = true,
  onPrimarySend,
}: Props) {
  const [message, setMessage] = useState("");
  const [overrideName, setOverrideName] = useState(recipientName?.trim() ?? "");
  const [overrideEmail, setOverrideEmail] = useState(recipient?.trim() ?? "");
  const latestPrimary = useMemo(() => activities[0] ?? null, [activities]);

  useEffect(() => {
    setOverrideName(recipientName?.trim() ?? "");
  }, [recipientName]);

  useEffect(() => {
    setOverrideEmail(recipient?.trim() ?? "");
  }, [recipient]);

  const handlePrimary = async () => {
    const result = await onPrimarySend({
      message: message.trim() || undefined,
      recipientEmail: overrideEmail.trim() || undefined,
      recipientName: overrideName.trim() || undefined,
    });
    if ((result as any)?.error) {
      toast.error((result as any).error.message);
      return;
    }
    setMessage("");
  };

  const latestPrimaryMeta = latestPrimary ? parseMeta(latestPrimary) : {};

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{recipient?.trim() || "Recipient email missing"}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {latestPrimary ? `Last sent ${formatWhen(latestPrimary.createdAt)}` : "No confirmation sent yet"}
              </p>
            </div>
            <Badge className={deliveryTone(latestPrimaryMeta.deliveryStatus)}>
              {latestPrimary ? formatDeliveryStatus(latestPrimaryMeta.deliveryStatus) : "Not sent"}
            </Badge>
          </div>
          {latestPrimaryMeta.deliveryError ? (
            <p className="mt-3 text-sm text-destructive">{latestPrimaryMeta.deliveryError}</p>
          ) : null}
        </div>

        {canSend ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${title}-recipient-name`}>Name</Label>
                <Input
                  id={`${title}-recipient-name`}
                  value={overrideName}
                  onChange={(event) => setOverrideName(event.target.value)}
                  placeholder="Recipient name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${title}-recipient-email`}>Email</Label>
                <Input
                  id={`${title}-recipient-email`}
                  type="email"
                  value={overrideEmail}
                  onChange={(event) => setOverrideEmail(event.target.value)}
                  placeholder="client@example.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${title}-message`}>Message note</Label>
              <Textarea
                id={`${title}-message`}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                placeholder="Optional context to include with the message..."
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button onClick={() => void handlePrimary()} disabled={sending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizonal className="mr-2 h-4 w-4" />}
                {primaryLabel}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
