import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { useOutletContext } from "react-router";
import { Copy, ExternalLink, LoaderCircle, RotateCcw, RotateCw, Share2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../api";
import { useAction, useFindMany, useFindOne } from "../../hooks/useApi";
import type { AuthOutletContext } from "../../routes/_app";
import { BookingBrandLogo } from "@/components/booking/BookingBrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  bookingBrandAccentColorOptions,
  bookingBrandBackgroundToneOptions,
  bookingBrandLogoBackgroundPlateOptions,
  bookingBrandLogoFitModeOptions,
  bookingBrandButtonStyleOptions,
  bookingBrandPrimaryColorOptions,
  defaultBookingBrandLogoTransform,
  normalizeBookingBrandLogoTransform,
  resolveBookingBrandTheme,
  type BookingBrandLogoTransform,
  type BookingBrandAccentColorToken,
  type BookingBrandBackgroundToneToken,
  type BookingBrandButtonStyleToken,
  type BookingBrandPrimaryColorToken,
  type BookingBrandingTokens,
} from "@/lib/bookingBranding";
import {
  DEFAULT_BOOKING_REQUEST_ALTERNATE_OFFER_EXPIRY_HOURS,
  DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT,
  resolveEffectiveBookingRequestSettings,
  type BookingRequestSettings,
} from "@/lib/bookingRequestSettings";
import { shareNativeContent, triggerNotificationFeedback, triggerSelectionFeedback } from "@/lib/nativeInteractions";
import { buildPreviewBookingUrl, buildPublicBookingUrl, openExternalUrl } from "@/lib/publicAppUrl";

type BuilderTab = "branding" | "experience" | "request" | "fields";
type PreviewMode = "live" | "request_timing" | "request_review";

type BusinessBookingBuilderRecord = {
  id: string;
  name?: string | null;
  bookingEnabled?: boolean | null;
  bookingDefaultFlow?: "request" | "self_book" | null;
  bookingPageTitle?: string | null;
  bookingPageSubtitle?: string | null;
  bookingBrandLogoUrl?: string | null;
  bookingBrandLogoTransform?: BookingBrandLogoTransform | null;
  bookingBrandPrimaryColorToken?: BookingBrandPrimaryColorToken | null;
  bookingBrandAccentColorToken?: BookingBrandAccentColorToken | null;
  bookingBrandBackgroundToneToken?: BookingBrandBackgroundToneToken | null;
  bookingBrandButtonStyleToken?: BookingBrandButtonStyleToken | null;
  bookingTrustBulletPrimary?: string | null;
  bookingTrustBulletSecondary?: string | null;
  bookingTrustBulletTertiary?: string | null;
  bookingConfirmationMessage?: string | null;
  bookingRequestRequireExactTime?: boolean | null;
  bookingRequestAllowTimeWindows?: boolean | null;
  bookingRequestAllowFlexibility?: boolean | null;
  bookingRequestAllowAlternateSlots?: boolean | null;
  bookingRequestAlternateSlotLimit?: number | null;
  bookingRequestAlternateOfferExpiryHours?: number | null;
  bookingRequestConfirmationCopy?: string | null;
  bookingRequestOwnerResponsePageCopy?: string | null;
  bookingRequestAlternateAcceptanceCopy?: string | null;
  bookingRequestChooseAnotherDayCopy?: string | null;
  bookingNotesPrompt?: string | null;
  bookingRequireEmail?: boolean | null;
  bookingRequirePhone?: boolean | null;
  bookingRequireVehicle?: boolean | null;
  bookingAllowCustomerNotes?: boolean | null;
  bookingShowPrices?: boolean | null;
  bookingShowDurations?: boolean | null;
  notificationAppointmentConfirmationEmailEnabled?: boolean | null;
  bookingUrgencyEnabled?: boolean | null;
  bookingUrgencyText?: string | null;
  bookingSlotIntervalMinutes?: number | null;
  bookingBufferMinutes?: number | null;
  bookingCapacityPerSlot?: number | null;
};

type BookingBuilderFormState = {
  bookingEnabled: boolean;
  bookingPageTitle: string;
  bookingPageSubtitle: string;
  bookingBrandLogoUrl: string;
  bookingBrandLogoTransform: BookingBrandLogoTransform;
  bookingBrandPrimaryColorToken: BookingBrandPrimaryColorToken;
  bookingBrandAccentColorToken: BookingBrandAccentColorToken;
  bookingBrandBackgroundToneToken: BookingBrandBackgroundToneToken;
  bookingBrandButtonStyleToken: BookingBrandButtonStyleToken;
  bookingTrustBulletPrimary: string;
  bookingTrustBulletSecondary: string;
  bookingTrustBulletTertiary: string;
  bookingDefaultFlow: "request" | "self_book";
  bookingConfirmationMessage: string;
  bookingRequestRequireExactTime: boolean;
  bookingRequestAllowTimeWindows: boolean;
  bookingRequestAllowFlexibility: boolean;
  bookingRequestAllowAlternateSlots: boolean;
  bookingRequestAlternateSlotLimit: string;
  bookingRequestAlternateOfferExpiryHours: string;
  bookingRequestConfirmationCopy: string;
  bookingRequestOwnerResponsePageCopy: string;
  bookingRequestAlternateAcceptanceCopy: string;
  bookingRequestChooseAnotherDayCopy: string;
  bookingNotesPrompt: string;
  bookingRequireEmail: boolean;
  bookingRequirePhone: boolean;
  bookingRequireVehicle: boolean;
  bookingAllowCustomerNotes: boolean;
  bookingShowPrices: boolean;
  bookingShowDurations: boolean;
  notificationAppointmentConfirmationEmailEnabled: boolean;
  bookingUrgencyEnabled: boolean;
  bookingUrgencyText: string;
  bookingSlotIntervalMinutes: 15 | 30 | 45 | 60;
  bookingBufferMinutes: string;
  bookingCapacityPerSlot: string;
};

const defaultForm: BookingBuilderFormState = {
  bookingEnabled: false,
  bookingPageTitle: "",
  bookingPageSubtitle: "",
  bookingBrandLogoUrl: "",
  bookingBrandLogoTransform: defaultBookingBrandLogoTransform,
  bookingBrandPrimaryColorToken: "orange",
  bookingBrandAccentColorToken: "amber",
  bookingBrandBackgroundToneToken: "ivory",
  bookingBrandButtonStyleToken: "solid",
  bookingTrustBulletPrimary: "Goes directly to the shop",
  bookingTrustBulletSecondary: "Quick follow-up",
  bookingTrustBulletTertiary: "Secure and simple",
  bookingDefaultFlow: "request",
  bookingConfirmationMessage: "",
  bookingRequestRequireExactTime: false,
  bookingRequestAllowTimeWindows: true,
  bookingRequestAllowFlexibility: true,
  bookingRequestAllowAlternateSlots: true,
  bookingRequestAlternateSlotLimit: String(DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT),
  bookingRequestAlternateOfferExpiryHours: String(DEFAULT_BOOKING_REQUEST_ALTERNATE_OFFER_EXPIRY_HOURS),
  bookingRequestConfirmationCopy: "",
  bookingRequestOwnerResponsePageCopy: "",
  bookingRequestAlternateAcceptanceCopy: "",
  bookingRequestChooseAnotherDayCopy: "",
  bookingNotesPrompt: "Add timing, questions, or anything the shop should know.",
  bookingRequireEmail: false,
  bookingRequirePhone: false,
  bookingRequireVehicle: true,
  bookingAllowCustomerNotes: true,
  bookingShowPrices: true,
  bookingShowDurations: true,
  notificationAppointmentConfirmationEmailEnabled: true,
  bookingUrgencyEnabled: false,
  bookingUrgencyText: "Only 3 spots left this week",
  bookingSlotIntervalMinutes: 15,
  bookingBufferMinutes: "",
  bookingCapacityPerSlot: "",
};

type BookingBuilderServiceRecord = {
  id: string;
  name: string;
  bookingEnabled?: boolean | null;
  bookingFlowType?: "inherit" | "request" | "self_book" | null;
  bookingLeadTimeHours?: number | null;
  bookingRequestRequireExactTime?: boolean | null;
  bookingRequestAllowTimeWindows?: boolean | null;
  bookingRequestAllowFlexibility?: boolean | null;
  bookingRequestReviewMessage?: string | null;
  bookingRequestAllowAlternateSlots?: boolean | null;
  bookingRequestAlternateSlotLimit?: number | null;
  bookingRequestAlternateOfferExpiryHours?: number | null;
};

type BookingBuilderServiceFormState = {
  bookingFlowType: "inherit" | "request" | "self_book";
  bookingLeadTimeHours: string;
  bookingRequestRequireExactTime: "inherit" | "true" | "false";
  bookingRequestAllowTimeWindows: "inherit" | "true" | "false";
  bookingRequestAllowFlexibility: "inherit" | "true" | "false";
  bookingRequestReviewMessage: string;
  bookingRequestAllowAlternateSlots: "inherit" | "true" | "false";
  bookingRequestAlternateSlotLimit: string;
  bookingRequestAlternateOfferExpiryHours: string;
};

function toForm(record?: BusinessBookingBuilderRecord | null): BookingBuilderFormState {
  const flow = record?.bookingDefaultFlow === "self_book" ? "self_book" : "request";
  return {
    bookingEnabled: record?.bookingEnabled === true,
    bookingPageTitle: record?.bookingPageTitle ?? "",
    bookingPageSubtitle: record?.bookingPageSubtitle ?? "",
    bookingBrandLogoUrl: record?.bookingBrandLogoUrl ?? "",
    bookingBrandLogoTransform: normalizeBookingBrandLogoTransform(record?.bookingBrandLogoTransform),
    bookingBrandPrimaryColorToken: record?.bookingBrandPrimaryColorToken ?? "orange",
    bookingBrandAccentColorToken: record?.bookingBrandAccentColorToken ?? "amber",
    bookingBrandBackgroundToneToken: record?.bookingBrandBackgroundToneToken ?? "ivory",
    bookingBrandButtonStyleToken: record?.bookingBrandButtonStyleToken ?? "solid",
    bookingTrustBulletPrimary: record?.bookingTrustBulletPrimary ?? "Goes directly to the shop",
    bookingTrustBulletSecondary:
      record?.bookingTrustBulletSecondary ?? (flow === "self_book" ? "Quick confirmation" : "Quick follow-up"),
    bookingTrustBulletTertiary: record?.bookingTrustBulletTertiary ?? "Secure and simple",
    bookingDefaultFlow: flow,
    bookingConfirmationMessage: record?.bookingConfirmationMessage ?? "",
    bookingRequestRequireExactTime: record?.bookingRequestRequireExactTime === true,
    bookingRequestAllowTimeWindows: record?.bookingRequestAllowTimeWindows !== false,
    bookingRequestAllowFlexibility: record?.bookingRequestAllowFlexibility !== false,
    bookingRequestAllowAlternateSlots: record?.bookingRequestAllowAlternateSlots !== false,
    bookingRequestAlternateSlotLimit: String(
      record?.bookingRequestAlternateSlotLimit ?? DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT
    ),
    bookingRequestAlternateOfferExpiryHours: String(
      record?.bookingRequestAlternateOfferExpiryHours ?? DEFAULT_BOOKING_REQUEST_ALTERNATE_OFFER_EXPIRY_HOURS
    ),
    bookingRequestConfirmationCopy: record?.bookingRequestConfirmationCopy ?? "",
    bookingRequestOwnerResponsePageCopy: record?.bookingRequestOwnerResponsePageCopy ?? "",
    bookingRequestAlternateAcceptanceCopy: record?.bookingRequestAlternateAcceptanceCopy ?? "",
    bookingRequestChooseAnotherDayCopy: record?.bookingRequestChooseAnotherDayCopy ?? "",
    bookingNotesPrompt: record?.bookingNotesPrompt ?? defaultForm.bookingNotesPrompt,
    bookingRequireEmail: record?.bookingRequireEmail === true,
    bookingRequirePhone: record?.bookingRequirePhone === true,
    bookingRequireVehicle: record?.bookingRequireVehicle !== false,
    bookingAllowCustomerNotes: record?.bookingAllowCustomerNotes !== false,
    bookingShowPrices: record?.bookingShowPrices !== false,
    bookingShowDurations: record?.bookingShowDurations !== false,
    notificationAppointmentConfirmationEmailEnabled:
      record?.notificationAppointmentConfirmationEmailEnabled !== false,
    bookingUrgencyEnabled: record?.bookingUrgencyEnabled === true,
    bookingUrgencyText: record?.bookingUrgencyText ?? defaultForm.bookingUrgencyText,
    bookingSlotIntervalMinutes:
      record?.bookingSlotIntervalMinutes === 30 ||
      record?.bookingSlotIntervalMinutes === 45 ||
      record?.bookingSlotIntervalMinutes === 60
        ? record.bookingSlotIntervalMinutes
        : 15,
    bookingBufferMinutes:
      record?.bookingBufferMinutes != null && Number.isFinite(record.bookingBufferMinutes)
        ? String(record.bookingBufferMinutes)
        : "",
    bookingCapacityPerSlot:
      record?.bookingCapacityPerSlot != null && Number.isFinite(record.bookingCapacityPerSlot)
        ? String(record.bookingCapacityPerSlot)
        : "",
  };
}

function toBrandingTokens(form: BookingBuilderFormState): BookingBrandingTokens {
  return {
    primaryColorToken: form.bookingBrandPrimaryColorToken,
    accentColorToken: form.bookingBrandAccentColorToken,
    backgroundToneToken: form.bookingBrandBackgroundToneToken,
    buttonStyleToken: form.bookingBrandButtonStyleToken,
    logoUrl: form.bookingBrandLogoUrl.trim() || null,
    logoTransform: form.bookingBrandLogoTransform,
  };
}

function booleanOverrideToken(value: boolean | null | undefined): "inherit" | "true" | "false" {
  if (value == null) return "inherit";
  return value ? "true" : "false";
}

function booleanOverrideValue(value: "inherit" | "true" | "false"): boolean | null {
  if (value === "inherit") return null;
  return value === "true";
}

function formsMatch<T>(left: T, right: T) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildServiceFormState(service?: BookingBuilderServiceRecord | null): BookingBuilderServiceFormState {
  return {
    bookingFlowType: service?.bookingFlowType ?? "inherit",
    bookingLeadTimeHours: String(service?.bookingLeadTimeHours ?? 0),
    bookingRequestRequireExactTime: booleanOverrideToken(service?.bookingRequestRequireExactTime ?? null),
    bookingRequestAllowTimeWindows: booleanOverrideToken(service?.bookingRequestAllowTimeWindows ?? null),
    bookingRequestAllowFlexibility: booleanOverrideToken(service?.bookingRequestAllowFlexibility ?? null),
    bookingRequestReviewMessage: service?.bookingRequestReviewMessage ?? "",
    bookingRequestAllowAlternateSlots: booleanOverrideToken(service?.bookingRequestAllowAlternateSlots ?? null),
    bookingRequestAlternateSlotLimit:
      service?.bookingRequestAlternateSlotLimit != null ? String(service.bookingRequestAlternateSlotLimit) : "",
    bookingRequestAlternateOfferExpiryHours:
      service?.bookingRequestAlternateOfferExpiryHours != null
        ? String(service.bookingRequestAlternateOfferExpiryHours)
        : "",
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor={id} className="text-sm font-semibold text-slate-950">
            {label}
          </Label>
          <p className="text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      </div>
    </div>
  );
}

function StableBuilderSelect(props: React.ComponentProps<typeof Select>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionRef = useRef<{
    window: { left: number; top: number };
    elements: Array<{ element: HTMLElement; left: number; top: number }>;
  }>({
    window: { left: 0, top: 0 },
    elements: [],
  });

  const getScrollTargets = () => {
    if (typeof window === "undefined") return [];
    const targets = new Set<HTMLElement>();
    const addTarget = (element: Element | null | undefined) => {
      if (element instanceof HTMLElement) targets.add(element);
    };

    addTarget(document.scrollingElement);
    addTarget(document.documentElement);
    addTarget(document.body);
    addTarget(rootRef.current?.closest(".app-native-scroll"));
    document.querySelectorAll(".app-native-scroll").forEach(addTarget);

    let current = rootRef.current?.parentElement ?? null;
    while (current) {
      if (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth) {
        addTarget(current);
      }
      current = current.parentElement;
    }

    return Array.from(targets);
  };

  const rememberScrollPosition = () => {
    if (typeof window === "undefined") return;
    scrollPositionRef.current = {
      window: { left: window.scrollX, top: window.scrollY },
      elements: getScrollTargets().map((element) => ({
        element,
        left: element.scrollLeft,
        top: element.scrollTop,
      })),
    };
  };

  const restoreScrollPosition = () => {
    if (typeof window === "undefined") return;
    const snapshot = scrollPositionRef.current;
    const restore = () => {
      const { left, top } = snapshot.window;
      window.scrollTo({ left, top, behavior: "auto" });
      document.scrollingElement?.scrollTo({ left, top, behavior: "auto" });
      snapshot.elements.forEach(({ element, left: elementLeft, top: elementTop }) => {
        element.scrollTo({ left: elementLeft, top: elementTop, behavior: "auto" });
      });
    };
    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(restore);
    });
    for (const delay of [0, 16, 60, 140, 280]) {
      window.setTimeout(restore, delay);
    }
  };

  const stabilizeInteraction = () => {
    rememberScrollPosition();
    restoreScrollPosition();
  };

  const children = Children.map(props.children, (child) => {
    if (!isValidElement(child) || child.type !== SelectContent) return child;
    const selectContent = child as ReactElement<
      React.ComponentProps<typeof SelectContent> & { avoidViewportScroll?: boolean }
    >;
    return cloneElement(
      selectContent,
      {
        avoidViewportScroll: true,
        onCloseAutoFocus: (event) => {
          event.preventDefault();
          stabilizeInteraction();
          selectContent.props.onCloseAutoFocus?.(event);
        },
      }
    );
  });

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={stabilizeInteraction}
      onMouseDownCapture={stabilizeInteraction}
      onFocusCapture={stabilizeInteraction}
      onClickCapture={stabilizeInteraction}
      onKeyDownCapture={(event) => {
        if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
          stabilizeInteraction();
        }
      }}
    >
      <Select
        {...props}
        onOpenChange={(open) => {
          stabilizeInteraction();
          props.onOpenChange?.(open);
          restoreScrollPosition();
        }}
        onValueChange={(value) => {
          stabilizeInteraction();
          props.onValueChange?.(value);
          restoreScrollPosition();
        }}
      >
        {children}
      </Select>
    </div>
  );
}

function getUnsupportedBookingBuilderKeys(message: string | undefined): string[] {
  if (!message) return [];
  const trimmed = message.trim();
  const supportedKeys = ["bookingBufferMinutes", "bookingCapacityPerSlot"] as const;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      const discovered = parsed.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const keys = (item as { keys?: unknown }).keys;
        return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string") : [];
      });
      return supportedKeys.filter((key) => discovered.includes(key));
    }
  } catch {
    // Fall through to string matching.
  }

  return supportedKeys.filter((key) => trimmed.includes(key));
}

const MAX_BOOKING_LOGO_FILE_BYTES = 4 * 1024 * 1024;
const MAX_BOOKING_LOGO_DIMENSION = 1200;
const MAX_BOOKING_LOGO_DATA_URL_LENGTH = 400_000;
const BOOKING_LOGO_ALPHA_THRESHOLD = 16;
const BOOKING_LOGO_WHITE_THRESHOLD = 246;
const BOOKING_LOGO_CROP_PADDING_RATIO = 0.1;

type LogoPixelBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type BookingLogoDataUrlResult = {
  dataUrl: string;
  fitMode: BookingBrandLogoTransform["fitMode"];
};

function createEmptyLogoBounds(): LogoPixelBounds {
  return { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: -1, maxY: -1 };
}

function extendLogoBounds(bounds: LogoPixelBounds, x: number, y: number) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function hasLogoBounds(bounds: LogoPixelBounds) {
  return bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY;
}

function detectLogoContentBounds(imageData: ImageData): LogoPixelBounds | null {
  const alphaBounds = createEmptyLogoBounds();
  const nonWhiteBounds = createEmptyLogoBounds();
  const { data, width, height } = imageData;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] ?? 0;
      if (alpha <= BOOKING_LOGO_ALPHA_THRESHOLD) continue;

      extendLogoBounds(alphaBounds, x, y);

      const red = data[index] ?? 255;
      const green = data[index + 1] ?? 255;
      const blue = data[index + 2] ?? 255;
      const isNearWhite =
        red >= BOOKING_LOGO_WHITE_THRESHOLD &&
        green >= BOOKING_LOGO_WHITE_THRESHOLD &&
        blue >= BOOKING_LOGO_WHITE_THRESHOLD;
      if (!isNearWhite) {
        extendLogoBounds(nonWhiteBounds, x, y);
      }
    }
  }

  if (hasLogoBounds(nonWhiteBounds)) {
    return nonWhiteBounds;
  }
  if (hasLogoBounds(alphaBounds)) {
    return alphaBounds;
  }
  return null;
}

function padLogoBounds(bounds: LogoPixelBounds, width: number, height: number): LogoPixelBounds {
  const contentWidth = bounds.maxX - bounds.minX + 1;
  const contentHeight = bounds.maxY - bounds.minY + 1;
  const padding = Math.max(8, Math.round(Math.max(contentWidth, contentHeight) * BOOKING_LOGO_CROP_PADDING_RATIO));

  return {
    minX: Math.max(0, bounds.minX - padding),
    minY: Math.max(0, bounds.minY - padding),
    maxX: Math.min(width - 1, bounds.maxX + padding),
    maxY: Math.min(height - 1, bounds.maxY + padding),
  };
}

function inferLogoFitMode(width: number, height: number): BookingBrandLogoTransform["fitMode"] {
  const aspectRatio = width / Math.max(height, 1);
  return aspectRatio >= 2.2 ? "wordmark" : "contain";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read that image."));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not process that image."));
    };
    image.src = objectUrl;
  });
}

async function buildBookingLogoDataUrl(file: File): Promise<BookingLogoDataUrlResult> {
  if (file.size > MAX_BOOKING_LOGO_FILE_BYTES) {
    throw new Error("Logo image must be smaller than 4 MB.");
  }

  if (file.type === "image/svg+xml") {
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl.length > MAX_BOOKING_LOGO_DATA_URL_LENGTH) {
      throw new Error("That SVG is too large. Try a smaller logo file.");
    }
    return { dataUrl, fitMode: defaultBookingBrandLogoTransform.fitMode };
  }

  const image = await loadImageFromFile(file);
  const maxSide = Math.max(image.naturalWidth, image.naturalHeight, 1);
  const scale = Math.min(1, MAX_BOOKING_LOGO_DIMENSION / maxSide);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not process that image.");
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const detectedBounds = detectLogoContentBounds(context.getImageData(0, 0, width, height));
  const paddedBounds = detectedBounds ? padLogoBounds(detectedBounds, width, height) : null;
  const croppedWidth = paddedBounds ? paddedBounds.maxX - paddedBounds.minX + 1 : width;
  const croppedHeight = paddedBounds ? paddedBounds.maxY - paddedBounds.minY + 1 : height;
  const cropArea = croppedWidth * croppedHeight;
  const fullArea = width * height;
  const shouldCrop = paddedBounds && cropArea > 0 && cropArea < fullArea * 0.92;
  const outputScale = Math.min(1, MAX_BOOKING_LOGO_DIMENSION / Math.max(croppedWidth, croppedHeight, 1));
  const outputWidth = Math.max(1, Math.round(croppedWidth * outputScale));
  const outputHeight = Math.max(1, Math.round(croppedHeight * outputScale));
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;

  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) {
    throw new Error("Could not process that image.");
  }

  outputContext.clearRect(0, 0, outputWidth, outputHeight);
  if (shouldCrop && paddedBounds) {
    outputContext.drawImage(
      canvas,
      paddedBounds.minX,
      paddedBounds.minY,
      croppedWidth,
      croppedHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );
  } else {
    outputContext.drawImage(canvas, 0, 0, width, height, 0, 0, outputWidth, outputHeight);
  }

  let dataUrl = outputCanvas.toDataURL("image/webp", 0.9);
  if (dataUrl.length > MAX_BOOKING_LOGO_DATA_URL_LENGTH) {
    dataUrl = outputCanvas.toDataURL("image/png");
  }
  if (dataUrl.length > MAX_BOOKING_LOGO_DATA_URL_LENGTH) {
    throw new Error("That logo is too detailed. Try a simpler image or smaller file.");
  }

  return { dataUrl, fitMode: inferLogoFitMode(outputWidth, outputHeight) };
}

function createFreshLogoTransform(
  current?: BookingBrandLogoTransform | null,
  inferredFitMode?: BookingBrandLogoTransform["fitMode"]
): BookingBrandLogoTransform {
  return {
    ...defaultBookingBrandLogoTransform,
    fitMode: inferredFitMode ?? current?.fitMode ?? defaultBookingBrandLogoTransform.fitMode,
    backgroundPlate: current?.backgroundPlate ?? defaultBookingBrandLogoTransform.backgroundPlate,
  };
}

export default function BookingBuilderPage() {
  const { businessId, permissions } = useOutletContext<AuthOutletContext>();
  const canRead = permissions.has("settings.read");
  const canEdit = permissions.has("settings.write");
  const canReadServices = permissions.has("services.read");
  const canEditServices = permissions.has("services.write");
  const [activeTab, setActiveTab] = useState<BuilderTab>("branding");
  const [form, setForm] = useState<BookingBuilderFormState>(defaultForm);
  const [savedForm, setSavedForm] = useState<BookingBuilderFormState>(defaultForm);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("live");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);
  const [logoEditorSourceUrl, setLogoEditorSourceUrl] = useState<string>("");
  const [logoEditorTransform, setLogoEditorTransform] = useState<BookingBrandLogoTransform>(
    defaultBookingBrandLogoTransform
  );
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [serviceForm, setServiceForm] = useState<BookingBuilderServiceFormState>(
    buildServiceFormState(null)
  );
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const logoEditorFrameRef = useRef<HTMLDivElement | null>(null);
  const lastSavedServerFormRef = useRef<BookingBuilderFormState | null>(null);
  const logoDragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  const [{ data: business, fetching, error }, refetchBusiness] = useFindOne(api.business, businessId ?? "", {
    pause: !businessId || !canRead,
  });
  const [{ fetching: saving }, runUpdateBusiness] = useAction(api.business.update);
  const [{ data: servicesData, fetching: servicesFetching }, refetchServices] = useFindMany(api.service, {
    pause: !businessId || !canReadServices,
    first: 200,
  });
  const [{ fetching: savingService }, runUpdateService] = useAction(api.service.update);

  const businessRecord = (business as BusinessBookingBuilderRecord | undefined) ?? null;
  const services = useMemo(
    () =>
      ((servicesData as BookingBuilderServiceRecord[] | undefined) ?? []).filter(
        (service) => service.bookingEnabled === true
      ),
    [servicesData]
  );
  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedServiceId, services]
  );

  useEffect(() => {
    if (!businessRecord) return;
    const next = toForm(businessRecord);
    if (lastSavedServerFormRef.current && !formsMatch(next, lastSavedServerFormRef.current)) {
      return;
    }
    lastSavedServerFormRef.current = null;
    setForm((current) => (formsMatch(current, next) ? current : next));
    setSavedForm((current) => (formsMatch(current, next) ? current : next));
  }, [businessRecord]);

  useEffect(() => {
    lastSavedServerFormRef.current = null;
  }, [businessId]);

  useEffect(() => {
    if (!services.length) {
      setSelectedServiceId((current) => (current === "" ? current : ""));
      const next = buildServiceFormState(null);
      setServiceForm((current) => (formsMatch(current, next) ? current : next));
      return;
    }
    setSelectedServiceId((current) =>
      services.some((service) => service.id === current) ? current : services[0]?.id ?? ""
    );
  }, [services]);

  useEffect(() => {
    const next = buildServiceFormState(selectedService);
    setServiceForm((current) => (formsMatch(current, next) ? current : next));
  }, [selectedService]);

  const bookingUrl = useMemo(() => buildPublicBookingUrl(businessId), [businessId]);
  const previewBaseUrl = useMemo(() => buildPreviewBookingUrl(businessId), [businessId]);
  const previewQuery = useMemo(() => {
    const params = new URLSearchParams({
      builderPreview: "1",
      previewRefresh: String(previewNonce),
    });
    if (previewMode !== "live") {
      params.set("builderPreviewFlow", "request");
      if (previewMode === "request_timing") params.set("builderPreviewStep", "schedule");
      if (previewMode === "request_review") params.set("builderPreviewStep", "review");
    }
    return params.toString();
  }, [previewMode, previewNonce]);
  const previewUrl = useMemo(
    () => (previewBaseUrl ? `${previewBaseUrl}?${previewQuery}` : "about:blank"),
    [previewBaseUrl, previewQuery]
  );
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
  const bookingTheme = useMemo(() => resolveBookingBrandTheme(toBrandingTokens(form)), [form]);
  const brandingPreviewTokens = useMemo(() => toBrandingTokens(form), [form]);
  const businessRequestSettings = useMemo<BookingRequestSettings>(
    () => ({
      requireExactTime: form.bookingRequestRequireExactTime,
      allowTimeWindows: form.bookingRequestAllowTimeWindows,
      allowFlexibility: form.bookingRequestAllowFlexibility,
      allowAlternateSlots: form.bookingRequestAllowAlternateSlots,
      alternateSlotLimit: Number(form.bookingRequestAlternateSlotLimit) || DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT,
      alternateOfferExpiryHours:
        Number(form.bookingRequestAlternateOfferExpiryHours) || DEFAULT_BOOKING_REQUEST_ALTERNATE_OFFER_EXPIRY_HOURS,
      confirmationCopy: form.bookingRequestConfirmationCopy.trim() || null,
      ownerResponsePageCopy: form.bookingRequestOwnerResponsePageCopy.trim() || null,
      alternateAcceptanceCopy: form.bookingRequestAlternateAcceptanceCopy.trim() || null,
      chooseAnotherDayCopy: form.bookingRequestChooseAnotherDayCopy.trim() || null,
    }),
    [form]
  );
  const effectiveSelectedServiceRequestSettings = useMemo(
    () =>
      resolveEffectiveBookingRequestSettings({
        business: businessRequestSettings,
        service:
          selectedService != null
            ? {
                requireExactTime: selectedService.bookingRequestRequireExactTime ?? null,
                allowTimeWindows: selectedService.bookingRequestAllowTimeWindows ?? null,
                allowFlexibility: selectedService.bookingRequestAllowFlexibility ?? null,
                reviewMessage: selectedService.bookingRequestReviewMessage ?? null,
                allowAlternateSlots: selectedService.bookingRequestAllowAlternateSlots ?? null,
                alternateSlotLimit: selectedService.bookingRequestAlternateSlotLimit ?? null,
                alternateOfferExpiryHours: selectedService.bookingRequestAlternateOfferExpiryHours ?? null,
              }
            : null,
      }),
    [businessRequestSettings, selectedService]
  );
  const serviceDirty = useMemo(() => {
    if (!selectedService) return false;
    return JSON.stringify(serviceForm) !== JSON.stringify(buildServiceFormState(selectedService));
  }, [selectedService, serviceForm]);

  const updateField = <K extends keyof BookingBuilderFormState>(key: K, value: BookingBuilderFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applySavedBusinessState = (record: unknown, fallback: BookingBuilderFormState) => {
    const next =
      record && typeof record === "object"
        ? toForm(record as BusinessBookingBuilderRecord)
        : fallback;
    lastSavedServerFormRef.current = next;
    setForm((current) => (formsMatch(current, next) ? current : next));
    setSavedForm((current) => (formsMatch(current, next) ? current : next));
  };

  const openLogoEditor = (sourceUrl: string, transform: BookingBrandLogoTransform) => {
    setLogoEditorSourceUrl(sourceUrl);
    setLogoEditorTransform(normalizeBookingBrandLogoTransform(transform));
    setLogoEditorOpen(true);
  };

  const applyLogoEditor = () => {
    if (!logoEditorSourceUrl.trim()) return;
    updateField("bookingBrandLogoUrl", logoEditorSourceUrl.trim());
    updateField("bookingBrandLogoTransform", normalizeBookingBrandLogoTransform(logoEditorTransform));
    setLogoEditorOpen(false);
    toast.success("Logo framing updated.");
  };

  const handleLogoEditorPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!logoEditorFrameRef.current) return;
    logoDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: logoEditorTransform.offsetX,
      startOffsetY: logoEditorTransform.offsetY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resetLogoEditor = () => {
    setLogoEditorTransform(createFreshLogoTransform(logoEditorTransform));
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = logoDragStateRef.current;
      const frameElement = logoEditorFrameRef.current;
      if (!dragState || !frameElement || dragState.pointerId !== event.pointerId) return;
      const bounds = frameElement.getBoundingClientRect();
      const width = Math.max(bounds.width, 1);
      const height = Math.max(bounds.height, 1);
      const nextOffsetX = dragState.startOffsetX + (event.clientX - dragState.startX) / (width * 0.18);
      const nextOffsetY = dragState.startOffsetY + (event.clientY - dragState.startY) / (height * 0.18);
      setLogoEditorTransform((current) =>
        normalizeBookingBrandLogoTransform({
          ...current,
          offsetX: nextOffsetX,
          offsetY: nextOffsetY,
        })
      );
    };

    const finishDrag = (event: PointerEvent) => {
      if (!logoDragStateRef.current || logoDragStateRef.current.pointerId !== event.pointerId) return;
      logoDragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [logoEditorTransform.offsetX, logoEditorTransform.offsetY]);

  const saveChanges = async () => {
    if (!businessId || !canEdit) return;
    const payload = {
      id: businessId,
      bookingEnabled: form.bookingEnabled,
      bookingPageTitle: form.bookingPageTitle.trim() || null,
      bookingPageSubtitle: form.bookingPageSubtitle.trim() || null,
      bookingBrandLogoUrl: form.bookingBrandLogoUrl.trim() || null,
      bookingBrandLogoTransform: form.bookingBrandLogoUrl.trim()
        ? normalizeBookingBrandLogoTransform(form.bookingBrandLogoTransform)
        : null,
      bookingBrandPrimaryColorToken: form.bookingBrandPrimaryColorToken,
      bookingBrandAccentColorToken: form.bookingBrandAccentColorToken,
      bookingBrandBackgroundToneToken: form.bookingBrandBackgroundToneToken,
      bookingBrandButtonStyleToken: form.bookingBrandButtonStyleToken,
      bookingTrustBulletPrimary: form.bookingTrustBulletPrimary.trim() || null,
      bookingTrustBulletSecondary: form.bookingTrustBulletSecondary.trim() || null,
      bookingTrustBulletTertiary: form.bookingTrustBulletTertiary.trim() || null,
      bookingDefaultFlow: form.bookingDefaultFlow,
      bookingConfirmationMessage: form.bookingConfirmationMessage.trim() || null,
      bookingRequestRequireExactTime: form.bookingRequestRequireExactTime,
      bookingRequestAllowTimeWindows: form.bookingRequestAllowTimeWindows,
      bookingRequestAllowFlexibility: form.bookingRequestAllowFlexibility,
      bookingRequestAllowAlternateSlots: form.bookingRequestAllowAlternateSlots,
      bookingRequestAlternateSlotLimit:
        Number(form.bookingRequestAlternateSlotLimit) || DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT,
      bookingRequestAlternateOfferExpiryHours:
        Number(form.bookingRequestAlternateOfferExpiryHours) || DEFAULT_BOOKING_REQUEST_ALTERNATE_OFFER_EXPIRY_HOURS,
      bookingRequestConfirmationCopy: form.bookingRequestConfirmationCopy.trim() || null,
      bookingRequestOwnerResponsePageCopy: form.bookingRequestOwnerResponsePageCopy.trim() || null,
      bookingRequestAlternateAcceptanceCopy: form.bookingRequestAlternateAcceptanceCopy.trim() || null,
      bookingRequestChooseAnotherDayCopy: form.bookingRequestChooseAnotherDayCopy.trim() || null,
      bookingNotesPrompt: form.bookingNotesPrompt.trim() || null,
      bookingRequireEmail: form.bookingRequireEmail,
      bookingRequirePhone: form.bookingRequirePhone,
      bookingRequireVehicle: form.bookingRequireVehicle,
      bookingAllowCustomerNotes: form.bookingAllowCustomerNotes,
      bookingShowPrices: form.bookingShowPrices,
      bookingShowDurations: form.bookingShowDurations,
      notificationAppointmentConfirmationEmailEnabled: form.notificationAppointmentConfirmationEmailEnabled,
      bookingUrgencyEnabled: form.bookingUrgencyEnabled,
      bookingUrgencyText: form.bookingUrgencyText.trim() || null,
      bookingSlotIntervalMinutes: form.bookingSlotIntervalMinutes,
      bookingRequestUrl: bookingUrl || null,
      ...(form.bookingBufferMinutes.trim()
        ? { bookingBufferMinutes: Number(form.bookingBufferMinutes) }
        : {}),
      ...(form.bookingCapacityPerSlot.trim()
        ? { bookingCapacityPerSlot: Number(form.bookingCapacityPerSlot) }
        : {}),
    };
    let result = await runUpdateBusiness(payload);
    const unsupportedKeys = getUnsupportedBookingBuilderKeys(result.error?.message);
    const droppedAdvancedFields =
      unsupportedKeys.length > 0
        ? unsupportedKeys.filter((key) => key in payload)
        : [];

    if (droppedAdvancedFields.length > 0) {
      const retryPayload = { ...payload };
      for (const key of droppedAdvancedFields) {
        delete retryPayload[key];
      }
      result = await runUpdateBusiness(retryPayload);
      if (!result.error) {
        applySavedBusinessState(result.data, form);
        setPreviewNonce((current) => current + 1);
        toast.success("Booking builder updated. Buffer and capacity settings will save after the backend finishes updating.");
        void refetchBusiness();
        return;
      }
    }

    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    applySavedBusinessState(result.data, form);
    setPreviewNonce((current) => current + 1);
    toast.success("Booking builder updated.");
    void refetchBusiness();
  };

  const saveServicePolicy = async () => {
    if (!selectedService || !canEditServices) return;
    const result = await runUpdateService({
      id: selectedService.id,
      bookingFlowType: serviceForm.bookingFlowType,
      bookingLeadTimeHours: Number(serviceForm.bookingLeadTimeHours || "0"),
      bookingRequestRequireExactTime: booleanOverrideValue(serviceForm.bookingRequestRequireExactTime),
      bookingRequestAllowTimeWindows: booleanOverrideValue(serviceForm.bookingRequestAllowTimeWindows),
      bookingRequestAllowFlexibility: booleanOverrideValue(serviceForm.bookingRequestAllowFlexibility),
      bookingRequestReviewMessage: serviceForm.bookingRequestReviewMessage.trim() || null,
      bookingRequestAllowAlternateSlots: booleanOverrideValue(serviceForm.bookingRequestAllowAlternateSlots),
      bookingRequestAlternateSlotLimit: serviceForm.bookingRequestAlternateSlotLimit.trim()
        ? Number(serviceForm.bookingRequestAlternateSlotLimit)
        : null,
      bookingRequestAlternateOfferExpiryHours: serviceForm.bookingRequestAlternateOfferExpiryHours.trim()
        ? Number(serviceForm.bookingRequestAlternateOfferExpiryHours)
        : null,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Service request policy updated.");
    void refetchServices();
    setPreviewNonce((current) => current + 1);
  };

  const copyBookingUrl = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      toast.success("Booking URL copied.");
      void triggerNotificationFeedback("success");
    } catch {
      toast.error("Could not copy the booking URL.");
      void triggerNotificationFeedback("error");
    }
  };

  const shareBookingUrl = async () => {
    if (!bookingUrl) return;
    const result = await shareNativeContent({
      title: "Strata booking page",
      text: businessRecord?.name ? `${businessRecord.name} booking page` : "Share the live Strata booking page.",
      url: bookingUrl,
    });

    if (result === "shared") {
      toast.success("Booking link shared.");
      void triggerNotificationFeedback("success");
      return;
    }
    if (result === "copied") {
      toast.success("Booking link copied.");
      void triggerNotificationFeedback("success");
      return;
    }
    if (result === "cancelled") return;

    toast.error("Could not share the booking link.");
    void triggerNotificationFeedback("error");
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setLogoUploading(true);
    try {
      const nextLogo = await buildBookingLogoDataUrl(file);
      openLogoEditor(nextLogo.dataUrl, createFreshLogoTransform(form.bookingBrandLogoTransform, nextLogo.fitMode));
      toast.success("Logo auto-fitted. Review the framing, then save.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload that logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  if (!businessId) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))]">
        <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6 lg:px-8">
          <Card className="rounded-[1.35rem] border-slate-200/80 bg-white/95 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <CardContent className="p-6 text-sm text-slate-600">Pick a business first before configuring booking.</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))]">
        <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6 lg:px-8">
          <Card className="rounded-[1.35rem] border-slate-200/80 bg-white/95 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <CardContent className="p-6 text-sm text-slate-600">You do not have permission to view booking settings.</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))]">
      <div className="mx-auto max-w-[1440px] px-3 py-5 pb-10 sm:px-6 lg:px-8">
        <div className="mb-5 overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/85 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_42px_rgba(15,23,42,0.06)] backdrop-blur-md">
          <div className="flex flex-col gap-4 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.13),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0))] px-3 py-3 sm:px-5 sm:py-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex h-9 items-center rounded-full border px-3 text-sm font-semibold", form.bookingEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600")}>
                {form.bookingEnabled ? "Live" : "Disabled"}
              </span>
              <span className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
                {services.length} booking service{services.length === 1 ? "" : "s"}
              </span>
              <span className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
                {form.bookingDefaultFlow === "self_book" ? "Direct booking default" : "Request-first default"}
              </span>
              {dirty ? (
                <span className="inline-flex h-9 items-center rounded-full border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800">
                  Unsaved changes
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:justify-end">
              <div className="flex h-10 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:min-w-36">
                <span className="text-sm font-semibold text-slate-700">Online</span>
                <Switch checked={form.bookingEnabled} onCheckedChange={(next) => updateField("bookingEnabled", next)} disabled={!canEdit} />
              </div>
              <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => void shareBookingUrl()} disabled={!bookingUrl}>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => {
                  if (!bookingUrl) return;
                  void triggerSelectionFeedback();
                  openExternalUrl(bookingUrl);
                }}
                disabled={!bookingUrl}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View live
              </Button>
              <Button type="button" onClick={saveChanges} disabled={!canEdit || !dirty || saving} className={cn("h-10 min-w-[150px] rounded-xl", bookingTheme.primaryButtonClassName)}>
                {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </div>
        </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(420px,520px)_minmax(0,1fr)]">
        <Card className="overflow-hidden rounded-[1.35rem] border-slate-200/80 bg-white/94 shadow-[0_18px_54px_rgba(15,23,42,0.06)]">
          <CardHeader className="border-b border-slate-200/70 bg-slate-50/65 px-4 py-4 sm:px-5">
            <CardTitle className="text-base tracking-[-0.01em]">Builder controls</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <Tabs value={activeTab} onValueChange={(next) => setActiveTab(next as BuilderTab)} className="gap-4">
              <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl bg-slate-100/80 p-1 sm:grid-cols-4">
                <TabsTrigger value="branding">Branding</TabsTrigger>
                <TabsTrigger value="experience">Experience</TabsTrigger>
                <TabsTrigger value="request">Request</TabsTrigger>
                <TabsTrigger value="fields">Fields</TabsTrigger>
              </TabsList>

              <TabsContent value="branding" className="space-y-3">
                <Field label="Portal name"><Input value={form.bookingPageTitle} onChange={(e) => updateField("bookingPageTitle", e.target.value)} placeholder="Spark Studio" disabled={!canEdit} /></Field>
                <Field label="Tagline"><Input value={form.bookingPageSubtitle} onChange={(e) => updateField("bookingPageSubtitle", e.target.value)} placeholder="Professional photography & video" disabled={!canEdit} /></Field>
                <Field label="Logo">
                  <div className="space-y-3">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={!canEdit || logoUploading}
                    />
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
                      <BookingBrandLogo
                        businessName={form.bookingPageTitle.trim() || businessRecord?.name || "Strata"}
                        branding={brandingPreviewTokens}
                        preset="builder_thumb"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-semibold text-slate-950">Upload and frame a logo</p>
                        <p className="text-xs leading-5 text-slate-500">
                          PNG, JPG, WEBP, or SVG. Reposition, crop, and rotate once so booking, email, and sharing stay consistent.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={!canEdit || logoUploading}
                        className="sm:w-auto"
                      >
                        {logoUploading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {form.bookingBrandLogoUrl ? "Replace image" : "Upload image"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          form.bookingBrandLogoUrl
                            ? openLogoEditor(form.bookingBrandLogoUrl, form.bookingBrandLogoTransform)
                            : logoInputRef.current?.click()
                        }
                        disabled={!canEdit || logoUploading}
                        className="sm:w-auto"
                      >
                        Adjust crop
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          updateField("bookingBrandLogoUrl", "");
                          updateField("bookingBrandLogoTransform", defaultBookingBrandLogoTransform);
                        }}
                        disabled={!canEdit || !form.bookingBrandLogoUrl || logoUploading}
                        className="sm:w-auto"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove image
                      </Button>
                    </div>
                  </div>
                </Field>
                <Field label="Primary color"><StableBuilderSelect value={form.bookingBrandPrimaryColorToken} onValueChange={(next) => updateField("bookingBrandPrimaryColorToken", next as BookingBrandPrimaryColorToken)} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{bookingBrandPrimaryColorOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></StableBuilderSelect></Field>
                <Field label="Accent color"><StableBuilderSelect value={form.bookingBrandAccentColorToken} onValueChange={(next) => updateField("bookingBrandAccentColorToken", next as BookingBrandAccentColorToken)} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{bookingBrandAccentColorOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></StableBuilderSelect></Field>
                <Field label="Background tone"><StableBuilderSelect value={form.bookingBrandBackgroundToneToken} onValueChange={(next) => updateField("bookingBrandBackgroundToneToken", next as BookingBrandBackgroundToneToken)} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{bookingBrandBackgroundToneOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></StableBuilderSelect></Field>
                <Field label="Button style"><StableBuilderSelect value={form.bookingBrandButtonStyleToken} onValueChange={(next) => updateField("bookingBrandButtonStyleToken", next as BookingBrandButtonStyleToken)} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{bookingBrandButtonStyleOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></StableBuilderSelect></Field>
                <Field label="Meta line 1"><Input value={form.bookingTrustBulletPrimary} onChange={(e) => updateField("bookingTrustBulletPrimary", e.target.value)} placeholder="5.0" disabled={!canEdit} /></Field>
                <Field label="Meta line 2"><Input value={form.bookingTrustBulletSecondary} onChange={(e) => updateField("bookingTrustBulletSecondary", e.target.value)} placeholder="200+ clients" disabled={!canEdit} /></Field>
                <Field label="Meta line 3"><Input value={form.bookingTrustBulletTertiary} onChange={(e) => updateField("bookingTrustBulletTertiary", e.target.value)} placeholder="Verified" disabled={!canEdit} /></Field>
              </TabsContent>

              <TabsContent value="experience" className="space-y-3">
                <Field label="Booking flow"><StableBuilderSelect value={form.bookingDefaultFlow} onValueChange={(next) => updateField("bookingDefaultFlow", next as "request" | "self_book")} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="request">Request</SelectItem><SelectItem value="self_book">Self book</SelectItem></SelectContent></StableBuilderSelect></Field>
                <Field label="Confirmation message"><Textarea value={form.bookingConfirmationMessage} onChange={(e) => updateField("bookingConfirmationMessage", e.target.value)} rows={4} disabled={!canEdit} /></Field>
                <Field label="Notes prompt"><Input value={form.bookingNotesPrompt} onChange={(e) => updateField("bookingNotesPrompt", e.target.value)} disabled={!canEdit} /></Field>
                <ToggleRow id="urgency-enabled" label="Urgency cues" description="Enable urgency messaging on the public booking page." checked={form.bookingUrgencyEnabled} onCheckedChange={(next) => updateField("bookingUrgencyEnabled", next)} disabled={!canEdit} />
                <Field label="Urgency message"><Input value={form.bookingUrgencyText} onChange={(e) => updateField("bookingUrgencyText", e.target.value)} placeholder="Only 3 spots left this week" disabled={!canEdit} /></Field>
                <Field label="Slot interval"><StableBuilderSelect value={String(form.bookingSlotIntervalMinutes)} onValueChange={(next) => updateField("bookingSlotIntervalMinutes", Number(next) as 15 | 30 | 45 | 60)} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="15">15 minutes</SelectItem><SelectItem value="30">30 minutes</SelectItem><SelectItem value="45">45 minutes</SelectItem><SelectItem value="60">60 minutes</SelectItem></SelectContent></StableBuilderSelect></Field>
                <Field label="Buffer minutes"><Input inputMode="numeric" value={form.bookingBufferMinutes} onChange={(e) => updateField("bookingBufferMinutes", e.target.value)} placeholder="15" disabled={!canEdit} /></Field>
                <Field label="Capacity per slot"><Input inputMode="numeric" value={form.bookingCapacityPerSlot} onChange={(e) => updateField("bookingCapacityPerSlot", e.target.value)} placeholder="1" disabled={!canEdit} /></Field>
                <Field label="Booking URL">
                  <div className="flex gap-2">
                    <Input value={bookingUrl} readOnly />
                    <Button type="button" variant="outline" size="icon" onClick={copyBookingUrl} disabled={!bookingUrl}><Copy className="h-4 w-4" /></Button>
                  </div>
                </Field>
              </TabsContent>

              <TabsContent value="fields" className="space-y-3">
                <ToggleRow id="require-email" label="Require email" description="Ask for email before booking can continue." checked={form.bookingRequireEmail} onCheckedChange={(next) => updateField("bookingRequireEmail", next)} disabled={!canEdit} />
                <ToggleRow id="require-phone" label="Require phone" description="Collect a phone number before submission." checked={form.bookingRequirePhone} onCheckedChange={(next) => updateField("bookingRequirePhone", next)} disabled={!canEdit} />
                <ToggleRow id="require-vehicle" label="Require vehicle info" description="Keep vehicle details in the booking flow." checked={form.bookingRequireVehicle} onCheckedChange={(next) => updateField("bookingRequireVehicle", next)} disabled={!canEdit} />
                <ToggleRow id="allow-notes" label="Allow customer notes" description="Show the notes field in the review step." checked={form.bookingAllowCustomerNotes} onCheckedChange={(next) => updateField("bookingAllowCustomerNotes", next)} disabled={!canEdit} />
                <ToggleRow id="show-prices" label="Show prices" description="Display visible pricing on the public booking page." checked={form.bookingShowPrices} onCheckedChange={(next) => updateField("bookingShowPrices", next)} disabled={!canEdit} />
                <ToggleRow id="show-durations" label="Show durations" description="Display visible duration details on the public booking page." checked={form.bookingShowDurations} onCheckedChange={(next) => updateField("bookingShowDurations", next)} disabled={!canEdit} />
                <ToggleRow id="confirmation-email" label="Send confirmation email" description="Use the existing confirmation email after self-booking." checked={form.notificationAppointmentConfirmationEmailEnabled} onCheckedChange={(next) => updateField("notificationAppointmentConfirmationEmailEnabled", next)} disabled={!canEdit} />
              </TabsContent>

              <TabsContent value="request" className="space-y-4">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/85 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Default request flow</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    In request mode, the customer always chooses a real preferred date. Use these controls to shape how precise the time request should be and how follow-up should feel.
                  </p>
                </div>

                <ToggleRow
                  id="request-exact-time"
                  label="Require exact time by default"
                  description="Turn off time windows and ask for one preferred time unless a service overrides it."
                  checked={form.bookingRequestRequireExactTime}
                  onCheckedChange={(next) => updateField("bookingRequestRequireExactTime", next)}
                  disabled={!canEdit}
                />
                <ToggleRow
                  id="request-time-windows"
                  label="Allow time windows"
                  description="Let customers choose a window like Morning or After 3 PM when exact time is not required."
                  checked={form.bookingRequestAllowTimeWindows}
                  onCheckedChange={(next) => updateField("bookingRequestAllowTimeWindows", next)}
                  disabled={!canEdit || form.bookingRequestRequireExactTime}
                />
                <ToggleRow
                  id="request-flexibility"
                  label="Allow flexibility choice"
                  description="Let customers say whether only this time works or nearby slots are okay."
                  checked={form.bookingRequestAllowFlexibility}
                  onCheckedChange={(next) => updateField("bookingRequestAllowFlexibility", next)}
                  disabled={!canEdit}
                />
                <ToggleRow
                  id="request-alternates"
                  label="Allow alternate slot offers"
                  description="Let the team respond with alternate time options instead of only approving or asking for a new day."
                  checked={form.bookingRequestAllowAlternateSlots}
                  onCheckedChange={(next) => updateField("bookingRequestAllowAlternateSlots", next)}
                  disabled={!canEdit}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Max alternate slots">
                    <Input
                      inputMode="numeric"
                      value={form.bookingRequestAlternateSlotLimit}
                      onChange={(e) => updateField("bookingRequestAlternateSlotLimit", e.target.value)}
                      placeholder="3"
                      disabled={!canEdit || !form.bookingRequestAllowAlternateSlots}
                    />
                  </Field>
                  <Field label="Alternate offer expiry (hours)">
                    <Input
                      inputMode="numeric"
                      value={form.bookingRequestAlternateOfferExpiryHours}
                      onChange={(e) => updateField("bookingRequestAlternateOfferExpiryHours", e.target.value)}
                      placeholder="48"
                      disabled={!canEdit || !form.bookingRequestAllowAlternateSlots}
                    />
                  </Field>
                </div>
                <Field label="Request confirmation copy">
                  <Textarea
                    value={form.bookingRequestConfirmationCopy}
                    onChange={(e) => updateField("bookingRequestConfirmationCopy", e.target.value)}
                    rows={3}
                    placeholder="Your request is with the shop. They’ll review the requested time and may approve it or send alternate options."
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Owner response page copy">
                  <Textarea
                    value={form.bookingRequestOwnerResponsePageCopy}
                    onChange={(e) => updateField("bookingRequestOwnerResponsePageCopy", e.target.value)}
                    rows={3}
                    placeholder="The shop already has your service details. Review the response below and keep everything moving without starting over."
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Alternate acceptance copy">
                  <Textarea
                    value={form.bookingRequestAlternateAcceptanceCopy}
                    onChange={(e) => updateField("bookingRequestAlternateAcceptanceCopy", e.target.value)}
                    rows={3}
                    placeholder="You’re booked. The shop locked in the alternate time and sent the final confirmation."
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Choose another day copy">
                  <Textarea
                    value={form.bookingRequestChooseAnotherDayCopy}
                    onChange={(e) => updateField("bookingRequestChooseAnotherDayCopy", e.target.value)}
                    rows={3}
                    placeholder="Pick another day or preferred time below. Your service and vehicle stay attached to the request."
                    disabled={!canEdit}
                  />
                </Field>

                <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Service request policies</p>
                    <p className="text-sm leading-6 text-slate-600">
                      Keep request-specific service rules here so the public flow and review loop can change without code.
                    </p>
                  </div>
                  {canReadServices ? (
                    <>
                      <Field label="Service">
                        <StableBuilderSelect value={selectedServiceId} onValueChange={setSelectedServiceId} disabled={servicesFetching || services.length === 0}>
                          <SelectTrigger><SelectValue placeholder={services.length ? "Choose a service" : "No booking services yet"} /></SelectTrigger>
                          <SelectContent>
                            {services.map((service) => (
                              <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </StableBuilderSelect>
                      </Field>
                      {selectedService ? (
                        <div className="space-y-3">
                          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/85 p-3">
                            <p className="text-sm font-semibold text-slate-950">{selectedService.name}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Use existing service lead time for minimum notice, then shape how this service collects request timing and how alternates should behave.
                            </p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Booking mode">
                              <StableBuilderSelect
                                value={serviceForm.bookingFlowType}
                                onValueChange={(value) =>
                                  setServiceForm((current) => ({ ...current, bookingFlowType: value as BookingBuilderServiceFormState["bookingFlowType"] }))
                                }
                                disabled={!canEditServices}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="inherit">Inherit business default</SelectItem>
                                  <SelectItem value="request">Request review</SelectItem>
                                  <SelectItem value="self_book">Direct book</SelectItem>
                                </SelectContent>
                              </StableBuilderSelect>
                            </Field>
                            <Field label="Minimum notice (hours)">
                              <Input
                                inputMode="numeric"
                                value={serviceForm.bookingLeadTimeHours}
                                onChange={(e) => setServiceForm((current) => ({ ...current, bookingLeadTimeHours: e.target.value }))}
                                placeholder="0"
                                disabled={!canEditServices}
                              />
                            </Field>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Exact time">
                              <StableBuilderSelect
                                value={serviceForm.bookingRequestRequireExactTime}
                                onValueChange={(value) =>
                                  setServiceForm((current) => ({ ...current, bookingRequestRequireExactTime: value as BookingBuilderServiceFormState["bookingRequestRequireExactTime"] }))
                                }
                                disabled={!canEditServices}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="inherit">Inherit</SelectItem>
                                  <SelectItem value="true">Require exact time</SelectItem>
                                  <SelectItem value="false">Do not require exact time</SelectItem>
                                </SelectContent>
                              </StableBuilderSelect>
                            </Field>
                            <Field label="Time windows">
                              <StableBuilderSelect
                                value={serviceForm.bookingRequestAllowTimeWindows}
                                onValueChange={(value) =>
                                  setServiceForm((current) => ({ ...current, bookingRequestAllowTimeWindows: value as BookingBuilderServiceFormState["bookingRequestAllowTimeWindows"] }))
                                }
                                disabled={!canEditServices}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="inherit">Inherit</SelectItem>
                                  <SelectItem value="true">Allow windows</SelectItem>
                                  <SelectItem value="false">Exact time only</SelectItem>
                                </SelectContent>
                              </StableBuilderSelect>
                            </Field>
                            <Field label="Flexibility choice">
                              <StableBuilderSelect
                                value={serviceForm.bookingRequestAllowFlexibility}
                                onValueChange={(value) =>
                                  setServiceForm((current) => ({ ...current, bookingRequestAllowFlexibility: value as BookingBuilderServiceFormState["bookingRequestAllowFlexibility"] }))
                                }
                                disabled={!canEditServices}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="inherit">Inherit</SelectItem>
                                  <SelectItem value="true">Allow flexibility</SelectItem>
                                  <SelectItem value="false">Hide flexibility</SelectItem>
                                </SelectContent>
                              </StableBuilderSelect>
                            </Field>
                            <Field label="Alternate slots">
                              <StableBuilderSelect
                                value={serviceForm.bookingRequestAllowAlternateSlots}
                                onValueChange={(value) =>
                                  setServiceForm((current) => ({ ...current, bookingRequestAllowAlternateSlots: value as BookingBuilderServiceFormState["bookingRequestAllowAlternateSlots"] }))
                                }
                                disabled={!canEditServices}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="inherit">Inherit</SelectItem>
                                  <SelectItem value="true">Allow alternates</SelectItem>
                                  <SelectItem value="false">No alternates</SelectItem>
                                </SelectContent>
                              </StableBuilderSelect>
                            </Field>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Max alternate slots">
                              <Input
                                inputMode="numeric"
                                value={serviceForm.bookingRequestAlternateSlotLimit}
                                onChange={(e) => setServiceForm((current) => ({ ...current, bookingRequestAlternateSlotLimit: e.target.value }))}
                                placeholder="3"
                                disabled={!canEditServices}
                              />
                            </Field>
                            <Field label="Alternate expiry (hours)">
                              <Input
                                inputMode="numeric"
                                value={serviceForm.bookingRequestAlternateOfferExpiryHours}
                                onChange={(e) => setServiceForm((current) => ({ ...current, bookingRequestAlternateOfferExpiryHours: e.target.value }))}
                                placeholder="48"
                                disabled={!canEditServices}
                              />
                            </Field>
                          </div>
                          <Field label="Review message">
                            <Textarea
                              value={serviceForm.bookingRequestReviewMessage}
                              onChange={(e) => setServiceForm((current) => ({ ...current, bookingRequestReviewMessage: e.target.value }))}
                              rows={3}
                              placeholder="We review this service request with timing, vehicle, and prep details before locking anything in."
                              disabled={!canEditServices}
                            />
                          </Field>
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-3 text-sm text-slate-600">
                            <p className="font-medium text-slate-900">Effective experience for this service</p>
                            <p className="mt-2 leading-6">
                              {effectiveSelectedServiceRequestSettings.requireExactTime
                                ? "Customers must choose an exact requested time."
                                : effectiveSelectedServiceRequestSettings.allowTimeWindows
                                  ? "Customers can choose an exact time or a time window."
                                  : "Customers stay on an exact-time request flow."}
                            </p>
                            <p className="mt-1 leading-6">
                              {effectiveSelectedServiceRequestSettings.allowFlexibility
                                ? "Flexibility options stay visible."
                                : "Flexibility stays hidden for this service."}
                            </p>
                            <p className="mt-1 leading-6">
                              {effectiveSelectedServiceRequestSettings.allowAlternateSlots
                                ? `The team can send up to ${effectiveSelectedServiceRequestSettings.alternateSlotLimit} alternate slot${effectiveSelectedServiceRequestSettings.alternateSlotLimit === 1 ? "" : "s"}${effectiveSelectedServiceRequestSettings.alternateOfferExpiryHours ? ` that expire after ${effectiveSelectedServiceRequestSettings.alternateOfferExpiryHours} hours.` : "."}`
                                : "The team will approve the requested slot or ask for another day instead of sending alternates."}
                            </p>
                          </div>
                          <Button
                            type="button"
                            onClick={saveServicePolicy}
                            disabled={!canEditServices || !serviceDirty || savingService}
                            variant="outline"
                          >
                            {savingService ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save service policy
                          </Button>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                          {servicesFetching ? "Loading booking services..." : "Turn on at least one service for online booking to shape per-service request behavior here."}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                      You can shape request copy here, but service-level request rules need service permissions too.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/85 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Response copy preview</p>
                  <div className="mt-3 grid gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="text-sm font-semibold text-slate-950">Owner response page</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {form.bookingRequestOwnerResponsePageCopy.trim() || "The shop already has your details. Review the response below and keep the request moving without starting over."}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="text-sm font-semibold text-slate-950">Alternate accepted</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {form.bookingRequestAlternateAcceptanceCopy.trim() || "You’re booked. The shop locked in the selected alternate time and sent the final confirmation."}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="text-sm font-semibold text-slate-950">Choose another day</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {form.bookingRequestChooseAnotherDayCopy.trim() || "Pick another day or preferred time below. Your service and vehicle stay attached to the request."}
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[1.35rem] border-slate-200/80 bg-white/94 shadow-[0_18px_54px_rgba(15,23,42,0.06)] xl:sticky xl:top-4 xl:self-start">
          <CardHeader className="border-b border-slate-200/70 bg-slate-50/65 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base tracking-[-0.01em]">Live preview</CardTitle>
                <p className="text-sm leading-6 text-slate-600">
                  {previewMode === "live"
                    ? "Uses the real public booking page in preview mode and refreshes after save."
                    : previewMode === "request_timing"
                      ? "Preview the preferred date and time step for request-mode services."
                      : "Preview the request review state with service, vehicle, and requested timing context."}
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                  <span className={cn("h-2 w-2 rounded-full", form.bookingEnabled ? "bg-emerald-500" : "bg-slate-300")} />
                  {form.bookingEnabled ? "Live" : "Disabled"}
                </div>
                <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                  {[
                    { value: "live" as PreviewMode, label: "Live page" },
                    { value: "request_timing" as PreviewMode, label: "Request timing" },
                    { value: "request_review" as PreviewMode, label: "Request review" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPreviewMode(option.value)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                        previewMode === option.value
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="bg-slate-100/70 p-2 sm:p-4">
            {fetching ? (
              <div className="flex h-[640px] items-center justify-center rounded-[1.5rem] border border-slate-200 bg-white xl:h-[760px]"><LoaderCircle className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : error ? (
              <div className="flex h-[640px] items-center justify-center rounded-[1.5rem] border border-red-200 bg-white px-6 text-center text-sm text-red-600 xl:h-[760px]">{error.message}</div>
            ) : (
              <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
                <div className="border-b border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{form.bookingPageTitle.trim() || "Tell us what you need"}</p>
                      <p className="truncate text-xs text-slate-500">{bookingUrl || "Booking URL unavailable"}</p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {bookingTheme.tokens.primaryColorToken}
                    </div>
                  </div>
                </div>
                <iframe title="Booking builder preview" src={previewUrl} className="h-[640px] w-full border-0 bg-white xl:h-[760px]" loading="lazy" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={logoEditorOpen} onOpenChange={setLogoEditorOpen}>
        <DialogContent className="max-w-[1120px] border-slate-200/80 bg-white/98 p-0 sm:max-w-[1120px]">
          <DialogHeader className="border-b border-slate-200/80 px-6 pt-6">
            <DialogTitle>Logo crop and framing</DialogTitle>
            <DialogDescription>
              Drag to reposition, rotate in fine steps, and choose the fit that should carry through the booking page, confirmation view, emails, and social previews.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="border-b border-slate-200/80 bg-slate-50/70 p-6 lg:border-r lg:border-b-0">
              <div className="space-y-4 rounded-[2rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.14),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Editor canvas</p>
                  <p className="text-sm leading-6 text-slate-600">
                    Drag inside the frame to set the visible crop. Wordmarks get a wider stage automatically.
                  </p>
                </div>
                <div className="flex min-h-[380px] items-center justify-center rounded-[1.75rem] border border-slate-200/80 bg-slate-950/[0.03] p-6">
                  <div ref={logoEditorFrameRef} className="inline-flex">
                    <BookingBrandLogo
                      businessName={form.bookingPageTitle.trim() || businessRecord?.name || "Strata"}
                      branding={{
                        ...brandingPreviewTokens,
                        logoUrl: logoEditorSourceUrl || null,
                        logoTransform: logoEditorTransform,
                      }}
                      preset="editor"
                      onPointerDown={handleLogoEditorPointerDown}
                    />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    {
                      key: "booking",
                      label: "Booking header",
                      preset: "hero" as const,
                    },
                    {
                      key: "confirmation",
                      label: "Confirmation",
                      preset: "confirmation" as const,
                    },
                    {
                      key: "email",
                      label: "Email header",
                      preset: "email" as const,
                    },
                    {
                      key: "share",
                      label: "Social share",
                      preset: "share" as const,
                    },
                  ].map((preview) => (
                    <div
                      key={preview.key}
                      className="rounded-[1.25rem] border border-slate-200/80 bg-white/90 p-4"
                      data-logo-preview={preview.key}
                    >
                      <div className="flex min-h-[128px] items-center justify-center rounded-[1rem] border border-dashed border-slate-200 bg-slate-50/70">
                        <BookingBrandLogo
                          businessName={form.bookingPageTitle.trim() || businessRecord?.name || "Strata"}
                          branding={{
                            ...brandingPreviewTokens,
                            logoUrl: logoEditorSourceUrl || null,
                            logoTransform: logoEditorTransform,
                          }}
                          preset={preview.preset}
                        />
                      </div>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {preview.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <Field label="Fit mode">
                  <StableBuilderSelect
                    value={logoEditorTransform.fitMode}
                    onValueChange={(value) =>
                      setLogoEditorTransform((current) =>
                        normalizeBookingBrandLogoTransform({
                          ...current,
                          fitMode: value as BookingBrandLogoTransform["fitMode"],
                        })
                      )
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {bookingBrandLogoFitModeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </StableBuilderSelect>
                </Field>

                <Field label="Background plate">
                  <StableBuilderSelect
                    value={logoEditorTransform.backgroundPlate}
                    onValueChange={(value) =>
                      setLogoEditorTransform((current) =>
                        normalizeBookingBrandLogoTransform({
                          ...current,
                          backgroundPlate: value as BookingBrandLogoTransform["backgroundPlate"],
                        })
                      )
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {bookingBrandLogoBackgroundPlateOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </StableBuilderSelect>
                </Field>
              </div>

              <div className="space-y-2 rounded-[1.25rem] border border-slate-200/80 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Zoom
                  </Label>
                  <span className="text-sm font-medium text-slate-700">{Math.round(logoEditorTransform.zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.01"
                  aria-label="Logo zoom"
                  value={logoEditorTransform.zoom}
                  onChange={(event) =>
                    setLogoEditorTransform((current) =>
                      normalizeBookingBrandLogoTransform({
                        ...current,
                        zoom: Number(event.target.value),
                      })
                    )
                  }
                  className="w-full accent-slate-900"
                />
              </div>

              <div className="space-y-2 rounded-[1.25rem] border border-slate-200/80 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Rotation
                  </Label>
                  <span className="text-sm font-medium text-slate-700">{logoEditorTransform.rotationDeg.toFixed(1)} deg</span>
                </div>
                <input
                  type="range"
                  min="-45"
                  max="45"
                  step="0.5"
                  aria-label="Logo rotation"
                  value={logoEditorTransform.rotationDeg}
                  onChange={(event) =>
                    setLogoEditorTransform((current) =>
                      normalizeBookingBrandLogoTransform({
                        ...current,
                        rotationDeg: Number(event.target.value),
                      })
                    )
                  }
                  className="w-full accent-slate-900"
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setLogoEditorTransform((current) =>
                        normalizeBookingBrandLogoTransform({
                          ...current,
                          rotationDeg: current.rotationDeg - 90,
                        })
                      )
                    }
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Rotate -90 deg
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setLogoEditorTransform((current) =>
                        normalizeBookingBrandLogoTransform({
                          ...current,
                          rotationDeg: current.rotationDeg + 90,
                        })
                      )
                    }
                  >
                    <RotateCw className="mr-2 h-4 w-4" />
                    Rotate +90 deg
                  </Button>
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-slate-200/80 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Positioning</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Drag inside the canvas to choose the crop focus. Transparent marks usually look best on Auto or Light plate.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    Horizontal offset: {logoEditorTransform.offsetX.toFixed(2)}
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    Vertical offset: {logoEditorTransform.offsetY.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200/80 px-6 py-5">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" onClick={resetLogoEditor}>
                Reset framing
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => setLogoEditorOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={applyLogoEditor} disabled={!logoEditorSourceUrl.trim()}>
                  Save logo framing
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
