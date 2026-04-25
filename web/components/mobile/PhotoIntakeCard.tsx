import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { API_BASE, api } from "@/api";
import { useFindMany } from "@/hooks/useApi";
import { getAuthToken, getCurrentBusinessId } from "@/lib/auth";
import { canUseNativeFieldOps, createPhotoAssetFromFile, pickNativePhoto, type NativePhotoAsset } from "@/lib/nativeFieldOps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type MediaTarget = {
  entityType: "appointment" | "client" | "vehicle";
  entityId: string;
  label: string;
  subtitle?: string | null;
};

type Props = {
  title?: string;
  description?: string;
  targets: MediaTarget[];
};

type UploadState = {
  targetLabel: string;
  progress: number;
};

function targetKey(target: MediaTarget): string {
  return `${target.entityType}:${target.entityId}`;
}

function uploadMediaAsset(target: MediaTarget, asset: NativePhotoAsset, onProgress: (value: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = `${API_BASE}/api/media-assets`;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/json");
    const authToken = getAuthToken();
    const currentBusinessId = getCurrentBusinessId();
    if (authToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
    }
    if (currentBusinessId) {
      xhr.setRequestHeader("x-business-id", currentBusinessId);
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.max(5, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check the connection and try again."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string };
        reject(new Error(body.message || "Upload failed."));
      } catch {
        reject(new Error("Upload failed."));
      }
    };
    xhr.send(
      JSON.stringify({
        entityType: target.entityType,
        entityId: target.entityId,
        label: target.label,
        fileName: asset.fileName,
        contentType: asset.mimeType,
        byteSize: asset.byteSize,
        width: asset.width,
        height: asset.height,
        dataUrl: asset.dataUrl,
      })
    );
  });
}

export function PhotoIntakeCard({
  title = "Vehicle photo intake",
  description = "Capture condition photos, plate shots, or proof-of-work from the native camera and library flow.",
  targets,
}: Props) {
  const [selectedTargetKey, setSelectedTargetKey] = useState(targets[0] ? targetKey(targets[0]) : "");
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [workingSource, setWorkingSource] = useState<"camera" | "library" | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!targets.some((target) => targetKey(target) === selectedTargetKey) && targets[0]) {
      setSelectedTargetKey(targetKey(targets[0]));
    }
  }, [selectedTargetKey, targets]);

  const selectedTarget = useMemo(
    () => targets.find((target) => targetKey(target) === selectedTargetKey) ?? targets[0] ?? null,
    [selectedTargetKey, targets]
  );

  const [{ data: assets, fetching, error }, refetchAssets] = useFindMany(api.mediaAsset, {
    entityType: selectedTarget?.entityType,
    entityId: selectedTarget?.entityId,
    first: 20,
    pause: !selectedTarget,
  });

  const finishUpload = async (target: MediaTarget, asset: NativePhotoAsset) => {
    setUploadState({ targetLabel: target.label, progress: 4 });
    try {
      await uploadMediaAsset(target, asset, (progress) =>
        setUploadState({ targetLabel: target.label, progress })
      );
      toast.success(`Photo attached to ${target.label}.`);
      await refetchAssets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploadState(null);
      setWorkingSource(null);
    }
  };

  const handleNativePick = async (source: "camera" | "library") => {
    if (!selectedTarget) return;
    setWorkingSource(source);
    const nativeAsset = await pickNativePhoto(source);
    if (!nativeAsset) {
      setWorkingSource(null);
      return;
    }
    await finishUpload(selectedTarget, nativeAsset);
  };

  const handleBrowserFiles = async (files: FileList | null) => {
    if (!selectedTarget || !files?.[0]) return;
    setWorkingSource("library");
    try {
      const preparedAsset = await createPhotoAssetFromFile(files[0]);
      await finishUpload(selectedTarget, preparedAsset);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare that photo.");
      setUploadState(null);
      setWorkingSource(null);
    }
  };

  return (
    <Card className="native-panel-card">
      <CardHeader className="pb-3">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {targets.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {targets.map((target) => {
              const active = selectedTarget ? targetKey(target) === targetKey(selectedTarget) : false;
              return (
                <Button
                  key={targetKey(target)}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className={cn("native-touch-surface justify-start", !active && "shadow-none")}
                  onClick={() => setSelectedTargetKey(targetKey(target))}
                >
                  {target.label}
                </Button>
              );
            })}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            className="native-touch-surface justify-start"
            onClick={() => {
              if (workingSource || !selectedTarget) return;
              if (canUseNativeFieldOps()) {
                void handleNativePick("camera");
                return;
              }
              cameraInputRef.current?.click();
            }}
            disabled={!selectedTarget || workingSource !== null}
          >
            {workingSource === "camera" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Capture photo
          </Button>
          <Button
            type="button"
            variant="outline"
            className="native-touch-surface justify-start"
            onClick={() => {
              if (workingSource) return;
              if (canUseNativeFieldOps()) {
                void handleNativePick("library");
                return;
              }
              libraryInputRef.current?.click();
            }}
            disabled={!selectedTarget || workingSource !== null}
          >
            {workingSource === "library" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Choose from library
          </Button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => void handleBrowserFiles(event.target.files)}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleBrowserFiles(event.target.files)}
        />

        {uploadState ? (
          <div className="rounded-xl border border-border/70 bg-muted/10 px-3 py-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Uploading to {uploadState.targetLabel}</span>
              <span className="text-muted-foreground">{uploadState.progress}%</span>
            </div>
            <Progress className="mt-3" value={uploadState.progress} />
          </div>
        ) : null}

        {selectedTarget?.subtitle ? (
          <div className="rounded-xl border border-border/70 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            {selectedTarget.subtitle}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
            Could not load intake photos. {error.message}
          </div>
        ) : null}

        {fetching && !Array.isArray(assets) ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recent photos...
          </div>
        ) : Array.isArray(assets) && assets.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {assets.map((asset) => (
              <div key={String((asset as any).id)} className="overflow-hidden rounded-[1.15rem] border border-border/70 bg-background/90">
                <img
                  src={String((asset as any).dataUrl)}
                  alt={String((asset as any).label ?? "Intake photo")}
                  className="h-40 w-full object-cover"
                />
                <div className="space-y-1 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {String((asset as any).label ?? selectedTarget?.label ?? "Photo")}
                    </p>
                    <Badge variant="outline">{String((asset as any).contentType ?? "image").replace("image/", "")}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(String((asset as any).createdAt ?? Date.now())).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No intake photos yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Capture the current condition, VIN, plate, or finished work from the phone.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
