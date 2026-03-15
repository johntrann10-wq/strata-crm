import { useState, useRef } from "react";
import { useFindMany, useAction } from "@gadgetinc/react";
import { toast } from "sonner";
import { Camera, Upload, X, Loader2, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "../api";

interface PhotoGalleryProps {
  appointmentId: string;
  businessId: string;
  readOnly?: boolean;
}

type PhotoTab = "before" | "after" | "inspection";

const TAB_LABELS: Record<PhotoTab, string> = {
  before: "Before",
  after: "After",
  inspection: "Inspection",
};

const TYPE_BADGE_CLASSES: Record<PhotoTab, string> = {
  before: "bg-blue-100 text-blue-700",
  after: "bg-green-100 text-green-700",
  inspection: "bg-amber-100 text-amber-700",
};

export function PhotoGallery({ appointmentId, businessId, readOnly = false }: PhotoGalleryProps) {
  const [activeTab, setActiveTab] = useState<PhotoTab>("before");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    id: string;
    type: string | null;
    caption: string | null;
    file: { url: string; fileName: string; mimeType: string } | null;
    createdAt: Date | string;
  } | null>(null);
  const [selectedType, setSelectedType] = useState<PhotoTab>("before");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [{ data: photos, fetching }, refetch] = useFindMany(api.appointmentPhoto, {
    filter: {
      appointmentId: { equals: appointmentId },
    },
    select: {
      id: true,
      type: true,
      caption: true,
      file: { url: true, fileName: true, mimeType: true },
      createdAt: true,
    },
    sort: { createdAt: "Ascending" },
  });

  const [, runCreate] = useAction(api.appointmentPhoto.create);
  const [, runDelete] = useAction(api.appointmentPhoto.delete);

  const filteredPhotos = (photos ?? []).filter((p) => p.type === activeTab);
  const totalCount = photos?.length ?? 0;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const theFile = e.target.files?.[0];
    if (!theFile) return;

    setUploading(true);
    try {
      await runCreate({
        file: { file: theFile, fileName: theFile.name, mimeType: theFile.type },
        type: selectedType,
        caption: caption.trim() !== "" ? caption.trim() : undefined,
        appointment: { _link: appointmentId },
        business: { _link: businessId },
      } as any);
      setCaption("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload photo";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photoId: string) => {
    try {
      await runDelete({ id: photoId });
      if (lightboxPhoto?.id === photoId) {
        setLightboxPhoto(null);
      }
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete photo";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Camera className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-lg">Photos</h3>
        {totalCount > 0 && (
          <span className="ml-1 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {totalCount}
          </span>
        )}
      </div>

      {/* Tab row */}
      <div className="flex gap-1">
        {(["before", "after", "inspection"] as PhotoTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Upload area */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Add Photo
          </button>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as PhotoTab)}
            className="rounded-md border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="before">Before</option>
            <option value="after">After</option>
            <option value="inspection">Inspection</option>
          </select>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Optional caption"
            className="min-w-[150px] flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Photo grid / empty state */}
      {fetching && !photos ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredPhotos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <Camera className="h-8 w-8 opacity-40" />
          <p className="text-sm">No {activeTab} photos yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-muted group"
              onClick={() => setLightboxPhoto(photo as any)}
            >
              {photo.file?.url && (
                <img
                  src={photo.file.url}
                  alt={photo.caption ?? "Appointment photo"}
                  className="h-full w-full object-cover"
                />
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                <ZoomIn className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                {photo.caption && (
                  <span className="absolute bottom-6 left-1 right-1 line-clamp-2 rounded bg-black/50 px-1 py-0.5 text-center text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {photo.caption}
                  </span>
                )}
              </div>

              {/* Delete button */}
              {!readOnly && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(photo.id);
                  }}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}

              {/* Type badge */}
              <span
                className={cn(
                  "absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-xs font-medium",
                  photo.type && photo.type in TYPE_BADGE_CLASSES
                    ? TYPE_BADGE_CLASSES[photo.type as PhotoTab]
                    : "bg-gray-100 text-gray-700"
                )}
              >
                {photo.type}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="relative flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxPhoto(null)}
              className="absolute -top-10 right-0 rounded-full p-1 text-white hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
            {lightboxPhoto.file?.url && (
              <img
                src={lightboxPhoto.file.url}
                alt={lightboxPhoto.caption ?? "Appointment photo"}
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
              />
            )}
            <div className="flex items-center gap-2">
              {lightboxPhoto.caption && (
                <span className="text-sm text-white">{lightboxPhoto.caption}</span>
              )}
              {lightboxPhoto.type && lightboxPhoto.type in TYPE_BADGE_CLASSES && (
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium",
                    TYPE_BADGE_CLASSES[lightboxPhoto.type as PhotoTab]
                  )}
                >
                  {lightboxPhoto.type}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}