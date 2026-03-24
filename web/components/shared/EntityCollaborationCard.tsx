import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, MessageSquarePlus } from "lucide-react";
import { api } from "../../api";
import { useAction } from "../../hooks/useApi";
import { ActivityFeedCard, type ActivityRecord } from "./ActivityFeedCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  entityType: "appointment" | "job";
  entityId: string;
  records: ActivityRecord[];
  fetching?: boolean;
  canWrite?: boolean;
  title?: string;
  onCreated?: () => void;
};

export function EntityCollaborationCard({
  entityType,
  entityId,
  records,
  fetching,
  canWrite = false,
  title = "Notes & Media",
  onCreated,
}: Props) {
  const [noteBody, setNoteBody] = useState("");
  const [mediaLabel, setMediaLabel] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [{ fetching: creating }, runCreate] = useAction(api.activityLog.create as any);

  const mediaRecords = useMemo(
    () => records.filter((record) => record.type?.endsWith(".media_added")).slice(0, 6),
    [records]
  );

  const handleCreateNote = async () => {
    const body = noteBody.trim();
    if (!body) return;
    const result = await runCreate({ entityType, entityId, kind: "note", body });
    if (result.error) {
      toast.error(`Failed to add note: ${result.error.message}`);
      return;
    }
    setNoteBody("");
    toast.success("Note added");
    onCreated?.();
  };

  const handleCreateMedia = async () => {
    const label = mediaLabel.trim();
    const url = mediaUrl.trim();
    if (!label || !url) return;
    const result = await runCreate({ entityType, entityId, kind: "media", label, url });
    if (result.error) {
      toast.error(`Failed to add media link: ${result.error.message}`);
      return;
    }
    setMediaLabel("");
    setMediaUrl("");
    toast.success("Media link added");
    onCreated?.();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {canWrite ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor={`${entityType}-note-body`}>Internal note</Label>
              <Textarea
                id={`${entityType}-note-body`}
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                rows={3}
                placeholder="Post a handoff note, blocker, quality-control update, or customer context..."
              />
              <Button onClick={() => void handleCreateNote()} disabled={creating || !noteBody.trim()}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-2 h-4 w-4" />}
                Add note
              </Button>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="space-y-2">
                <Label htmlFor={`${entityType}-media-label`}>Media label</Label>
                <Input
                  id={`${entityType}-media-label`}
                  value={mediaLabel}
                  onChange={(event) => setMediaLabel(event.target.value)}
                  placeholder="Before photos, damage photo set, inspection video..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${entityType}-media-url`}>Media URL</Label>
                <Input
                  id={`${entityType}-media-url`}
                  value={mediaUrl}
                  onChange={(event) => setMediaUrl(event.target.value)}
                  placeholder="https://..."
                />
              </div>
              <Button
                variant="outline"
                onClick={() => void handleCreateMedia()}
                disabled={creating || !mediaLabel.trim() || !mediaUrl.trim()}
              >
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                Add media link
              </Button>
            </div>
          </div>
        ) : null}

        {mediaRecords.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Linked media</p>
            <div className="grid gap-2">
              {mediaRecords.map((record) => {
                let label = "Media";
                let url = "";
                try {
                  const parsed = record.metadata ? (JSON.parse(record.metadata) as { label?: string; url?: string }) : null;
                  label = parsed?.label?.trim() || label;
                  url = parsed?.url?.trim() || "";
                } catch {
                  url = "";
                }
                return url ? (
                  <a
                    key={record.id}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
                  >
                    {label}
                  </a>
                ) : null;
              })}
            </div>
          </div>
        ) : null}

        <ActivityFeedCard title="Recent Activity" records={records} fetching={fetching} />
      </CardContent>
    </Card>
  );
}
