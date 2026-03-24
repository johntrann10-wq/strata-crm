import { useMemo, useState } from "react";
import { Mail, Loader2, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ActivityRecord = {
  id: string;
  type?: string | null;
  createdAt?: string | Date | null;
  metadata?: string | null;
};

type Props = {
  title: string;
  recipient?: string | null;
  primaryLabel: string;
  followUpLabel?: string;
  activities: ActivityRecord[];
  sending?: boolean;
  canSend?: boolean;
  onPrimarySend: (message?: string) => Promise<{ error?: { message?: string } } | void>;
  onFollowUpSend?: (message?: string) => Promise<{ error?: { message?: string } } | void>;
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
      return "Missing client email";
    case "email_failed":
      return "Email failed";
    default:
      return "Recorded";
  }
}

export function CommunicationCard({
  title,
  recipient,
  primaryLabel,
  followUpLabel,
  activities,
  sending,
  canSend = true,
  onPrimarySend,
  onFollowUpSend,
}: Props) {
  const [message, setMessage] = useState("");
  const latestPrimary = useMemo(() => activities[0] ?? null, [activities]);
  const latestFollowUp = useMemo(() => activities.find((record) => record.type?.includes("follow_up")) ?? null, [activities]);

  const handlePrimary = async () => {
    const result = await onPrimarySend(message.trim() || undefined);
    if ((result as any)?.error) {
      toast.error((result as any).error.message);
      return;
    }
    setMessage("");
  };

  const handleFollowUp = async () => {
    if (!onFollowUpSend) return;
    const result = await onFollowUpSend(message.trim() || undefined);
    if ((result as any)?.error) {
      toast.error((result as any).error.message);
      return;
    }
    setMessage("");
  };

  const latestPrimaryMeta = latestPrimary ? parseMeta(latestPrimary) : {};
  const latestFollowUpMeta = latestFollowUp ? parseMeta(latestFollowUp) : {};

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span>{recipient?.trim() || "No client email on file"}</span>
          </div>
          {latestPrimary ? (
            <p className="text-muted-foreground">
              Last send: {formatWhen(latestPrimary.createdAt)} | {formatDeliveryStatus(latestPrimaryMeta.deliveryStatus)}
            </p>
          ) : (
            <p className="text-muted-foreground">No communication recorded yet.</p>
          )}
          {latestPrimaryMeta.deliveryError ? (
            <p className="text-destructive">{latestPrimaryMeta.deliveryError}</p>
          ) : null}
          {latestFollowUp ? (
            <p className="text-muted-foreground">
              Last follow-up: {formatWhen(latestFollowUp.createdAt)} | {formatDeliveryStatus(latestFollowUpMeta.deliveryStatus)}
            </p>
          ) : null}
        </div>

        {canSend ? (
          <>
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
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handlePrimary()} disabled={sending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizonal className="mr-2 h-4 w-4" />}
                {primaryLabel}
              </Button>
              {onFollowUpSend && followUpLabel ? (
                <Button variant="outline" onClick={() => void handleFollowUp()} disabled={sending}>
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizonal className="mr-2 h-4 w-4" />}
                  {followUpLabel}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
