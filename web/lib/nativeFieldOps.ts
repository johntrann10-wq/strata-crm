import { registerPlugin } from "@capacitor/core";
import { isNativeShell } from "./mobileShell";

type HapticStyle = "light" | "medium" | "heavy" | "success" | "warning" | "error";
type PhotoSource = "camera" | "library";

type NativeNotificationPermissionStatus = "granted" | "denied" | "prompt";

export type NativePhotoAsset = {
  dataUrl: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
};

type FieldOpsPlugin = {
  openUrl(options: { url: string }): Promise<{ opened: boolean }>;
  share(options: { items: string[]; subject?: string; title?: string }): Promise<{ completed: boolean }>;
  haptic(options: { style?: HapticStyle }): Promise<void>;
  getNotificationPermissions(): Promise<{ status: NativeNotificationPermissionStatus; granted: boolean }>;
  requestNotificationPermissions(): Promise<{ status: NativeNotificationPermissionStatus; granted: boolean }>;
  scheduleLocalNotification(options: {
    identifier: string;
    title: string;
    body?: string;
    isoDate?: string | null;
    badgeCount?: number | null;
  }): Promise<{ scheduled: boolean }>;
  setBadgeCount(options: { count: number }): Promise<void>;
  pickImage(options: { source: PhotoSource }): Promise<NativePhotoAsset>;
};

const FieldOps = registerPlugin<FieldOpsPlugin>("FieldOps");

export function canUseNativeFieldOps(): boolean {
  return isNativeShell();
}

function normalizePhoneTarget(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[^0-9+]/g, "");
  return cleaned || null;
}

function normalizeEmailTarget(email: string): string | null {
  const trimmed = email.trim();
  return trimmed ? trimmed : null;
}

async function openUrl(url: string): Promise<boolean> {
  if (!url.trim()) return false;
  if (canUseNativeFieldOps()) {
    try {
      const result = await FieldOps.openUrl({ url });
      return result.opened === true;
    } catch {
      return false;
    }
  }

  if (typeof window === "undefined") return false;
  window.location.href = url;
  return true;
}

export async function openPhoneNumber(phone: string): Promise<boolean> {
  const normalized = normalizePhoneTarget(phone);
  return normalized ? openUrl(`tel:${normalized}`) : false;
}

export async function openTextMessage(phone: string, body?: string): Promise<boolean> {
  const normalized = normalizePhoneTarget(phone);
  if (!normalized) return false;
  const query = body?.trim() ? `?body=${encodeURIComponent(body.trim())}` : "";
  return openUrl(`sms:${normalized}${query}`);
}

export async function openEmailComposer(params: {
  email: string;
  subject?: string;
  body?: string;
}): Promise<boolean> {
  const normalized = normalizeEmailTarget(params.email);
  if (!normalized) return false;
  const query = new URLSearchParams();
  if (params.subject?.trim()) query.set("subject", params.subject.trim());
  if (params.body?.trim()) query.set("body", params.body.trim());
  return openUrl(`mailto:${normalized}${query.toString() ? `?${query.toString()}` : ""}`);
}

export async function openAppleMapsAddress(address: string): Promise<boolean> {
  const trimmed = address.trim();
  if (!trimmed) return false;
  return openUrl(`http://maps.apple.com/?q=${encodeURIComponent(trimmed)}`);
}

export async function triggerNativeHaptic(style: HapticStyle = "light"): Promise<void> {
  if (!canUseNativeFieldOps()) return;
  try {
    await FieldOps.haptic({ style });
  } catch {
    // Ignore haptic failures.
  }
}

export async function shareNativeItems(params: {
  items: string[];
  subject?: string;
  title?: string;
}): Promise<boolean> {
  const items = params.items.map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) return false;

  if (canUseNativeFieldOps()) {
    try {
      const result = await FieldOps.share({
        items,
        subject: params.subject?.trim() || undefined,
        title: params.title?.trim() || undefined,
      });
      return result.completed === true;
    } catch {
      return false;
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: params.title?.trim() || undefined,
        text: items.join("\n"),
      });
      return true;
    } catch {
      return false;
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(items.join("\n"));
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (!canUseNativeFieldOps()) return false;
  try {
    const current = await FieldOps.getNotificationPermissions();
    if (current.granted) return true;
    const requested = await FieldOps.requestNotificationPermissions();
    return requested.granted === true;
  } catch {
    return false;
  }
}

export async function syncNativeBadgeCount(count: number): Promise<void> {
  if (!canUseNativeFieldOps()) return;
  try {
    await FieldOps.setBadgeCount({ count: Math.max(0, Math.trunc(count)) });
  } catch {
    // Ignore badge sync failures.
  }
}

export async function scheduleNativeReminder(params: {
  identifier: string;
  title: string;
  body?: string;
  isoDate: string;
  badgeCount?: number | null;
}): Promise<boolean> {
  if (!canUseNativeFieldOps()) return false;
  const allowed = await ensureNotificationPermission();
  if (!allowed) return false;
  try {
    const result = await FieldOps.scheduleLocalNotification({
      identifier: params.identifier,
      title: params.title.trim(),
      body: params.body?.trim() || undefined,
      isoDate: params.isoDate,
      badgeCount: params.badgeCount ?? null,
    });
    return result.scheduled === true;
  } catch {
    return false;
  }
}

export async function notifyNativeUnreadNotification(params: {
  identifier: string;
  title: string;
  body: string;
  badgeCount: number;
}): Promise<boolean> {
  if (!canUseNativeFieldOps()) return false;
  const allowed = await ensureNotificationPermission();
  if (!allowed) return false;
  try {
    const result = await FieldOps.scheduleLocalNotification({
      identifier: params.identifier,
      title: params.title.trim(),
      body: params.body.trim(),
      isoDate: new Date(Date.now() + 750).toISOString(),
      badgeCount: params.badgeCount,
    });
    return result.scheduled === true;
  } catch {
    return false;
  }
}

export async function pickNativePhoto(source: PhotoSource): Promise<NativePhotoAsset | null> {
  if (!canUseNativeFieldOps()) return null;
  try {
    return await FieldOps.pickImage({ source });
  } catch {
    return null;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        reject(new Error("Could not read that image."));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not process that image."));
    image.src = dataUrl;
  });
}

export async function createPhotoAssetFromFile(file: File): Promise<NativePhotoAsset> {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(sourceDataUrl);
  const maxSide = Math.max(image.naturalWidth, image.naturalHeight, 1);
  const scale = maxSide > 1600 ? 1600 / maxSide : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not process that image.");
  }

  context.drawImage(image, 0, 0, width, height);

  let dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  if (dataUrl.length > 940_000) {
    dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  }
  if (dataUrl.length > 940_000) {
    dataUrl = canvas.toDataURL("image/webp", 0.72);
  }
  if (dataUrl.length > 940_000) {
    throw new Error("That photo is too large. Try a slightly smaller shot.");
  }

  const base64 = dataUrl.split(",")[1] ?? "";
  const byteSize = Math.floor((base64.length * 3) / 4);
  return {
    dataUrl,
    fileName: file.name || `intake-${Date.now()}.jpg`,
    mimeType: dataUrl.startsWith("data:image/webp") ? "image/webp" : "image/jpeg",
    width,
    height,
    byteSize,
  };
}
