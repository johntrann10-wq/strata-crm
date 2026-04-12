import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { canDismissBillingPrompt, getBillingPromptHeadline, type BillingPromptStage } from "@/lib/billingPrompts";

export function BillingPromptDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: BillingPromptStage;
  body: string;
  canManageBilling: boolean;
  loading: boolean;
  onContinue: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getBillingPromptHeadline(props.stage)}</DialogTitle>
          <DialogDescription>{props.body}</DialogDescription>
        </DialogHeader>
        {props.canManageBilling ? (
          <p className="text-sm text-muted-foreground">
            Open billing to add a payment method and keep the workspace running smoothly for the whole team.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            An owner or admin needs to update billing for this workspace.
          </p>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {canDismissBillingPrompt(props.stage) ? (
            <Button variant="outline" onClick={() => props.onOpenChange(false)} className="w-full sm:w-auto">
              Not now
            </Button>
          ) : null}
          <Button
            onClick={props.onContinue}
            disabled={props.loading || !props.canManageBilling}
            className="w-full sm:w-auto"
          >
            {props.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {props.stage === "paused" ? "Resume billing" : "Add payment method"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
