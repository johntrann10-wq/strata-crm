import { ChangeEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Images, Loader2, MessageSquarePlus } from "lucide-react";
import { api } from "../../api";
import { useAction } from "../../hooks/useApi";
import { ActivityFeedCard, type ActivityRecord } from "./ActivityFeedCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { isNativeShell } from "@/lib/mobileShell";
import { requestNativePhoto } from "@/lib/nativeMedia";
import {
  triggerImpactFeedback,
  triggerNotificationFeedback,
  triggerSelectionFeedback,
} from "@/lib/nativeInteractions";

type Props = {
  entityType: "appointment" | "job" | "client";
  entityId: string;
  records: ActivityRecord[];
  fetching?: boolean;
  canWrite?: boolean;
  title?: string;
  showNoteComposer?: boolean;
  onCreated?: () => void;
};

type UploadStage = "idle" | "preparing" | "saving";

type ParsedMediaRecord = {
  id: string;
  label: string;
  url: string;
  createdAt: Date | string | null | undefined;
};

const MAX_PHOTO_DIMENSION = 1600;
const TARGET_UPLOAD_BYTES = 560 * 1024;

function estimateDataUrlBytes(value: string): number {
  const parts = value.split(",", 2);
  if (parts.length !== 2) return Number.POSITIVE_INFINITY;
  const base64 = parts[1].replace(/\s+/g, "");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function stripFileExtension(value: string): string {
  return value.replace(/\.[a-z0-9]+$/i, "").trim();
}

function isImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^data:image\//i.test(trimmed)) return true;
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif)(\?|#|$)/i.test(trimmed);
}

function formatActivityTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseMediaRecord(record: ActivityRecord): ParsedMediaRecord | null {
  try {
    const parsed = record.metadata ? (JSON.parse(record.metadata) as { label?: string; url?: string }) : null;
    const url = parsed?.url?.trim();
    if (!url) return null;
    return {
      id: record.id,
      label: parsed?.label?.trim() || "Media",
      url,
      createdAt: record.createdAt,
    };
  } catch {
    return null;
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("Could not decode the selected file."));
    };
    reader.readAsDataURL(file);
  });
}

async function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not load that photo."));
    image.src = dataUrl;
  });
}

async function compressImageFile(file: File): Promise<string> {
  const originalDataUrl = await fileToDataUrl(file);
  const { width, height } = await loadImageDimensions(originalDataUrl);

  if (typeof document === "undefined") return originalDataUrl;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return originalDataUrl;

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load that photo."));
    image.src = originalDataUrl;
  });

  const longestSide = Math.max(width, height);
  const scale = longestSide > MAX_PHOTO_DIMENSION ? MAX_PHOTO_DIMENSION / longestSide : 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  let quality = 0.86;
  let nextDataUrl = canvas.toDataURL("image/jpeg", quality);
  while (estimateDataUrlBytes(nextDataUrl) > TARGET_UPLOAD_BYTES && quality > 0.42) {
    quality -= 0.08;
    nextDataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  return nextDataUrl;
}

export function EntityCollaborationCard({
  entityType,
  entityId,
  records,
  fetching,
  canWrite = false,
  title = "Photos & Activity",
  showNoteComposer = true,
  onCreated,
}: Props) {
  const [noteBody, setNoteBody] = useState("");
  const [mediaLabel, setMediaLabel] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadLabel, setUploadLabel] = useState<string>("");
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const [{ fetching: creating }, runCreate] = useAction(api.activityLog.create as any);
  const useNativePhotoPicker = isNativeShell();

  const mediaRecords = useMemo(
    () =>
      records
        .filter((record) => record.type?.endsWith(".media_added"))
        .map(parseMediaRecord)
        .filter((record): record is ParsedMediaRecord => Boolean(record))
        .slice(0, 8),
    [records]
  );

  const uploadProgress = uploadStage === "preparing" ? 36 : uploadStage === "saving" ? 82 : 0;
  const uploadBusy = uploadStage !== "idle";

  const handleCreateNote = async () => {
    const body = noteBody.trim();
    if (!body) return;
    await triggerImpactFeedback("light");
    const result = await runCreate({ entityType, entityId, kind: "note", body });
    if (result.error) {
      toast.error(`Failed to add note: ${result.error.message}`);
      void triggerNotificationFeedback("error");
      return;
    }
    setNoteBody("");
    toast.success("Note added");
    void triggerNotificationFeedback("success");
    onCreated?.();
  };

  const handleCreateMediaLink = async () => {
    const label = mediaLabel.trim();
    const url = mediaUrl.trim();
    if (!label || !url) return;
    await triggerImpactFeedback("light");
    const result = await runCreate({ entityType, entityId, kind: "media", label, url });
    if (result.error) {
      toast.error(`Failed to add media: ${result.error.message}`);
      void triggerNotificationFeedback("error");
      return;
    }
    setMediaLabel("");
    setMediaUrl("");
    toast.success("Media added");
    void triggerNotificationFeedback("success");
    onCreated?.();
  };

  const resetFileInput = (input: HTMLInputElement | null) => {
    if (input) input.value = "";
  };

  const handlePhotoCreate = async (payload: {
    dataUrl: string;
    source: "camera" | "library";
    defaultLabel: string;
  }) => {
    const resolvedLabel = mediaLabel.trim() || payload.defaultLabel;

    setUploadError(null);
    setUploadLabel(resolvedLabel);
    setUploadStage("saving");

    try {
      const result = await runCreate({
        entityType,
        entityId,
        kind: "media",
        label: resolvedLabel,
        url: payload.dataUrl,
      });

      if (result.error) {
        setUploadError(result.error.message ?? "Could not save that photo.");
        toast.error(`Failed to save photo: ${result.error.message}`);
        void triggerNotificationFeedback("error");
        return;
      }

      setMediaLabel("");
      setMediaUrl("");
      toast.success(payload.source === "camera" ? "Photo captured" : "Photo uploaded");
      void triggerNotificationFeedback("success");
      onCreated?.();
    } finally {
      setUploadStage("idle");
      setUploadLabel("");
    }
  };

  const handleSelectedFile = async (event: ChangeEvent<HTMLInputElement>, source: "camera" | "library") => {
    const file = event.target.files?.[0];
    resetFileInput(event.target);
    if (!file) return;

    const defaultLabel =
      stripFileExtension(file.name) ||
      (source === "camera" ? "Vehicle condition photo" : "Inspection photo");

    setUploadError(null);
    setUploadLabel(mediaLabel.trim() || defaultLabel);
    setUploadStage("preparing");
    await triggerSelectionFeedback();

    try {
      const compressedDataUrl = await compressImageFile(file);
      await handlePhotoCreate({
        dataUrl: compressedDataUrl,
        source,
        defaultLabel,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not prepare that photo.";
      setUploadError(message);
      toast.error(message);
      void triggerNotificationFeedback("error");
    } finally {
      setUploadStage("idle");
      setUploadLabel("");
      resetFileInput(cameraInputRef.current);
      resetFileInput(libraryInputRef.current);
    }
  };

  const handleNativePhoto = async (source: "camera" | "library") => {
    setUploadError(null);
    await triggerSelectionFeedback();

    try {
      const result = await requestNativePhoto(source);
      if (!result) return;

      await handlePhotoCreate({
        dataUrl: result.dataUrl,
        source,
        defaultLabel:
          stripFileExtension(result.fileName) ||
          (source === "camera" ? "Vehicle condition photo" : "Inspection photo"),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open that photo source.";
      setUploadError(message);
      toast.error(message);
      void triggerNotificationFeedback("error");
    }
  };

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {canWrite ? (
          <div className="space-y-5">
            {showNoteComposer ? (
              <div className="space-y-2">
                <Label htmlFor={`${entityType}-note-body`}>Quick handoff note</Label>
                <Textarea
                  id={`${entityType}-note-body`}
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  rows={3}
                  placeholder="Post a blocker, quality-control update, owner note, or customer context..."
                />
                <Button onClick={() => void handleCreateNote()} disabled={creating || uploadBusy || !noteBody.trim()}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-2 h-4 w-4" />}
                  Add note
                </Button>
              </div>
            ) : null}

            <div className="space-y-3 rounded-[1rem] border border-border/70 bg-muted/10 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Photo intake</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Capture vehicle condition, inspection, or before/after photos without leaving the job flow.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${entityType}-media-label`}>Photo label</Label>
                <Input
                  id={`${entityType}-media-label`}
                  value={mediaLabel}
                  onChange={(event) => setMediaLabel(event.target.value)}
                  placeholder="Before wash, damage check, QC photo set..."
                  disabled={creating || uploadBusy}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (useNativePhotoPicker) {
                      void handleNativePhoto("camera");
                      return;
                    }
                    void triggerSelectionFeedback();
                    cameraInputRef.current?.click();
                  }}
                  disabled={creating || uploadBusy}
                >
                  {uploadBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (useNativePhotoPicker) {
                      void handleNativePhoto("library");
                      return;
                    }
                    void triggerSelectionFeedback();
                    libraryInputRef.current?.click();
                  }}
                  disabled={creating || uploadBusy}
                >
                  {uploadBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Images className="mr-2 h-4 w-4" />}
                  Photo library
                </Button>
              </div>

              {!useNativePhotoPicker ? (
                <>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => void handleSelectedFile(event, "camera")}
                  />
                  <input
                    ref={libraryInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/*"
                    className="hidden"
                    onChange={(event) => void handleSelectedFile(event, "library")}
                  />
                </>
              ) : null}

              {uploadBusy ? (
                <div className="space-y-2 rounded-xl border border-border/70 bg-background/90 p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">
                      {uploadStage === "preparing" ? "Preparing photo" : "Saving photo"}
                    </span>
                    <span className="text-xs text-muted-foreground">{uploadLabel || "Photo"}</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              ) : null}

              {uploadError ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {uploadError}
                </div>
              ) : null}

              <div className="space-y-2 rounded-xl border border-border/70 bg-background/85 p-3">
                <Label htmlFor={`${entityType}-media-url`}>Or add a media link</Label>
                <Input
                  id={`${entityType}-media-url`}
                  value={mediaUrl}
                  onChange={(event) => setMediaUrl(event.target.value)}
                  placeholder="https://..."
                  disabled={creating || uploadBusy}
                />
                <Button
                  variant="outline"
                  onClick={() => void handleCreateMediaLink()}
                  disabled={creating || uploadBusy || !mediaLabel.trim() || !mediaUrl.trim()}
                >
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                  Add media link
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {mediaRecords.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Recent photos and media</p>
              <span className="text-xs text-muted-foreground">{mediaRecords.length} attached</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {mediaRecords.map((record) =>
                isImageUrl(record.url) ? (
                  <a
                    key={record.id}
                    href={record.url}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-[1rem] border border-border/70 bg-background shadow-sm transition-colors hover:border-primary/30"
                  >
                    <img src={record.url} alt={record.label} className="h-40 w-full object-cover" />
                    <div className="space-y-1 px-3 py-3">
                      <p className="text-sm font-medium text-foreground">{record.label}</p>
                      {formatActivityTime(record.createdAt) ? (
                        <p className="text-xs text-muted-foreground">{formatActivityTime(record.createdAt)}</p>
                      ) : null}
                    </div>
                  </a>
                ) : (
                  <a
                    key={record.id}
                    href={record.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-[1rem] border border-border/70 bg-background px-3 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted/30"
                  >
                    <p>{record.label}</p>
                    {formatActivityTime(record.createdAt) ? (
                      <p className="mt-1 text-xs font-normal text-muted-foreground">{formatActivityTime(record.createdAt)}</p>
                    ) : null}
                  </a>
                )
              )}
            </div>
          </div>
        ) : null}

        <ActivityFeedCard title="Recent activity" records={records} fetching={fetching} />
      </CardContent>
    </Card>
  );
}
