import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BellPlus, Mail, MapPinned, MessageSquareText, Phone, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  canUseNativeFieldOps,
  openAppleMapsAddress,
  openEmailComposer,
  openPhoneNumber,
  openTextMessage,
  scheduleNativeReminder,
  shareNativeItems,
  triggerNativeHaptic,
} from "@/lib/nativeFieldOps";

type Props = {
  title?: string;
  description?: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  reminderIdentifier: string;
  reminderTitle: string;
  reminderBody?: string;
  reminderSuggestedAt?: string | null;
  reminderButtonLabel?: string;
  shareItems?: string[];
  shareSubject?: string;
  shareTitle?: string;
  shareButtonLabel?: string;
};

function toLocalDateTimeInputValue(value: string | Date | null | undefined): string {
  const source = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(source.getTime())) {
    const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
    fallback.setMinutes(0, 0, 0);
    return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}-${String(fallback.getDate()).padStart(2, "0")}T${String(fallback.getHours()).padStart(2, "0")}:${String(fallback.getMinutes()).padStart(2, "0")}`;
  }
  source.setSeconds(0, 0);
  return `${source.getFullYear()}-${String(source.getMonth() + 1).padStart(2, "0")}-${String(source.getDate()).padStart(2, "0")}T${String(source.getHours()).padStart(2, "0")}:${String(source.getMinutes()).padStart(2, "0")}`;
}

export function NativeContactActionsCard({
  title = "Native field actions",
  description = "Reach the customer, navigate, and drop a reminder without bouncing through browser-like steps.",
  contactName,
  phone,
  email,
  address,
  reminderIdentifier,
  reminderTitle,
  reminderBody,
  reminderSuggestedAt,
  reminderButtonLabel = "Add follow-up reminder",
  shareItems,
  shareSubject,
  shareTitle,
  shareButtonLabel = "Share link",
}: Props) {
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderAt, setReminderAt] = useState(toLocalDateTimeInputValue(reminderSuggestedAt));
  const [workingAction, setWorkingAction] = useState<string | null>(null);

  useEffect(() => {
    setReminderAt(toLocalDateTimeInputValue(reminderSuggestedAt));
  }, [reminderSuggestedAt]);

  const smsBody = useMemo(() => {
    const greeting = contactName?.trim() ? `Hi ${contactName.trim()}, ` : "Hi, ";
    return `${greeting}following up from Strata CRM.`;
  }, [contactName]);
  const cleanedShareItems = (shareItems ?? []).map((item) => item.trim()).filter(Boolean);

  const handleOpenPhone = async () => {
    if (!phone?.trim()) {
      toast.error("No phone number is on file.");
      return;
    }
    const opened = await openPhoneNumber(phone);
    if (!opened) {
      toast.error("Could not open the phone dialer.");
      return;
    }
    await triggerNativeHaptic("light");
  };

  const handleOpenText = async () => {
    if (!phone?.trim()) {
      toast.error("No mobile number is on file.");
      return;
    }
    const opened = await openTextMessage(phone, smsBody);
    if (!opened) {
      toast.error("Could not open Messages.");
      return;
    }
    await triggerNativeHaptic("light");
  };

  const handleOpenEmail = async () => {
    if (!email?.trim()) {
      toast.error("No email address is on file.");
      return;
    }
    const opened = await openEmailComposer({
      email,
      subject: contactName?.trim() ? `Strata follow-up for ${contactName.trim()}` : "Strata follow-up",
    });
    if (!opened) {
      toast.error("Could not open Mail.");
      return;
    }
    await triggerNativeHaptic("light");
  };

  const handleOpenMaps = async () => {
    if (!address?.trim()) {
      toast.error("No service address is available.");
      return;
    }
    const opened = await openAppleMapsAddress(address);
    if (!opened) {
      toast.error("Could not open Apple Maps.");
      return;
    }
    await triggerNativeHaptic("light");
  };

  const handleShare = async () => {
    if (cleanedShareItems.length === 0) {
      toast.error("Nothing is ready to share yet.");
      return;
    }
    setWorkingAction("share");
    try {
      const shared = await shareNativeItems({
        items: cleanedShareItems,
        subject: shareSubject,
        title: shareTitle,
      });
      if (!shared) {
        toast.error("Could not open the share sheet.");
        return;
      }
      await triggerNativeHaptic("light");
    } finally {
      setWorkingAction(null);
    }
  };

  const handleScheduleReminder = async () => {
    if (!canUseNativeFieldOps()) {
      toast.error("Reminders are only available from the installed iPhone or iPad app.");
      return;
    }
    const parsed = new Date(reminderAt);
    if (Number.isNaN(parsed.getTime())) {
      toast.error("Choose a valid reminder time.");
      return;
    }
    setWorkingAction("reminder");
    try {
      const scheduled = await scheduleNativeReminder({
        identifier: reminderIdentifier,
        title: reminderTitle,
        body: reminderBody,
        isoDate: parsed.toISOString(),
      });
      if (!scheduled) {
        toast.error("Could not schedule that reminder.");
        return;
      }
      setReminderOpen(false);
      toast.success("Reminder added to this device.");
      await triggerNativeHaptic("success");
    } finally {
      setWorkingAction(null);
    }
  };

  return (
    <>
      <Card className="native-panel-card">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            {canUseNativeFieldOps() ? <Badge variant="secondary">Native</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="native-touch-surface justify-start" onClick={() => void handleOpenPhone()} disabled={!phone?.trim()}>
              <Phone className="h-4 w-4" />
              Call customer
            </Button>
            <Button type="button" variant="outline" className="native-touch-surface justify-start" onClick={() => void handleOpenText()} disabled={!phone?.trim()}>
              <MessageSquareText className="h-4 w-4" />
              Text customer
            </Button>
            <Button type="button" variant="outline" className="native-touch-surface justify-start" onClick={() => void handleOpenEmail()} disabled={!email?.trim()}>
              <Mail className="h-4 w-4" />
              Email customer
            </Button>
            <Button type="button" variant="outline" className="native-touch-surface justify-start" onClick={() => void handleOpenMaps()} disabled={!address?.trim()}>
              <MapPinned className="h-4 w-4" />
              Open in Maps
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" className="native-touch-surface justify-start" onClick={() => setReminderOpen(true)}>
              <BellPlus className="h-4 w-4" />
              {reminderButtonLabel}
            </Button>
            {cleanedShareItems.length > 0 ? (
              <Button type="button" variant="outline" className="native-touch-surface justify-start" onClick={() => void handleShare()} disabled={workingAction === "share"}>
                <Share2 className="h-4 w-4" />
                {shareButtonLabel}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add native reminder</DialogTitle>
            <DialogDescription>
              This creates a device reminder-style notification for this follow-up inside the iPhone or iPad app experience.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="native-reminder-at">Reminder time</Label>
              <Input
                id="native-reminder-at"
                type="datetime-local"
                value={reminderAt}
                onChange={(event) => setReminderAt(event.target.value)}
              />
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/15 px-3 py-3 text-sm text-muted-foreground">
              Retained in-app: the reminder title stays on the device. Customer data still lives in Strata and does not get copied into a separate account system.
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReminderOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleScheduleReminder()} disabled={workingAction === "reminder"}>
              <BellPlus className="h-4 w-4" />
              Save reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
