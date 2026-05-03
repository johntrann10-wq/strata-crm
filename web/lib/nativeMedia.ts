import { registerPlugin } from "@capacitor/core";
import { isNativeShell } from "@/lib/mobileShell";

type NativeMediaResponse = {
  cancelled?: boolean;
  dataUrl?: string;
  fileName?: string;
};

type NativeMediaPlugin = {
  capturePhoto(): Promise<NativeMediaResponse>;
  pickPhoto(): Promise<NativeMediaResponse>;
};

const NativeMedia = registerPlugin<NativeMediaPlugin>("NativeMedia");

function isImageDataUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && /^data:image\//i.test(value);
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

export async function requestNativePhoto(
  source: "camera" | "library"
): Promise<{ dataUrl: string; fileName: string } | null> {
  if (!isNativeShell()) return null;

  try {
    const result =
      source === "camera" ? await NativeMedia.capturePhoto() : await NativeMedia.pickPhoto();

    if (result?.cancelled) return null;
    if (!isImageDataUrl(result?.dataUrl)) {
      throw new Error("The selected photo could not be loaded.");
    }

    return {
      dataUrl: result.dataUrl,
      fileName:
        result.fileName?.trim() ||
        (source === "camera" ? "strata-camera-photo.jpg" : "strata-library-photo.jpg"),
    };
  } catch (error) {
    const message = toMessage(
      error,
      source === "camera" ? "Could not open the camera." : "Could not open the photo library."
    );

    if (/cancel/i.test(message)) return null;
    throw new Error(message, { cause: error });
  }
}
