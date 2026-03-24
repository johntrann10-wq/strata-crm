import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { api } from "../../api";
import { useAction } from "../../hooks/useApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ActivityRecord = {
  id: string;
  type?: string | null;
  metadata?: string | null;
};

type ChecklistItem = {
  itemId: string;
  label: string;
  completed: boolean;
};

export function ChecklistCard({
  entityType,
  entityId,
  records,
  canWrite,
  onChanged,
}: {
  entityType: "job" | "appointment";
  entityId: string;
  records: ActivityRecord[];
  canWrite: boolean;
  onChanged?: () => void;
}) {
  const [label, setLabel] = useState("");
  const [{ fetching: saving }, runCreate] = useAction(api.activityLog.create as any);

  const items = useMemo(() => {
    const map = new Map<string, ChecklistItem>();
    const orderedIds: string[] = [];
    for (const record of [...records].reverse()) {
      if (!record.type?.includes("checklist_item")) continue;
      try {
        const parsed = record.metadata ? (JSON.parse(record.metadata) as { itemId?: string; label?: string; completed?: boolean }) : null;
        const itemId = parsed?.itemId?.trim();
        const itemLabel = parsed?.label?.trim();
        if (!itemId || !itemLabel) continue;
        if (!map.has(itemId)) {
          orderedIds.push(itemId);
        }
        map.set(itemId, {
          itemId,
          label: itemLabel,
          completed: parsed?.completed === true,
        });
      } catch {
        continue;
      }
    }
    return orderedIds.map((itemId) => map.get(itemId)!).filter(Boolean);
  }, [records]);

  const handleAdd = async () => {
    const nextLabel = label.trim();
    if (!nextLabel) return;
    const itemId = crypto.randomUUID();
    const result = await runCreate({ entityType, entityId, kind: "checklist_add", itemId, label: nextLabel });
    if (result.error) {
      toast.error(`Failed to add checklist item: ${result.error.message}`);
      return;
    }
    setLabel("");
    toast.success("Checklist item added");
    onChanged?.();
  };

  const handleToggle = async (item: ChecklistItem) => {
    const result = await runCreate({
      entityType,
      entityId,
      kind: "checklist_toggle",
      itemId: item.itemId,
      label: item.label,
      completed: !item.completed,
    });
    if (result.error) {
      toast.error(`Failed to update checklist item: ${result.error.message}`);
      return;
    }
    toast.success(item.completed ? "Checklist item reopened" : "Checklist item completed");
    onChanged?.();
  };

  const completedCount = items.filter((item) => item.completed).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution Checklist</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canWrite ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Add prep, QC, delivery, or install checklist item..."
            />
            <Button onClick={() => void handleAdd()} disabled={saving || !label.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add item
            </Button>
          </div>
        ) : null}

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{items.length === 0 ? "No checklist items yet." : `${completedCount} of ${items.length} complete`}</span>
        </div>

        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item) => (
              <button
                key={item.itemId}
                type="button"
                onClick={() => void (canWrite ? handleToggle(item) : Promise.resolve())}
                className="flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-default"
                disabled={!canWrite || saving}
              >
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${item.completed ? "text-green-600" : "text-muted-foreground"}`} />
                <span className={item.completed ? "line-through text-muted-foreground" : "text-foreground"}>{item.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
