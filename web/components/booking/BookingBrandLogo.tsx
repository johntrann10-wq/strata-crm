import type { CSSProperties, PointerEventHandler } from "react";

import {
  normalizeBookingBranding,
  bookingBrandLogoTranslationFactor,
  resolveBookingBrandLogoFrame,
  resolveBookingBrandLogoPlateStyles,
  type BookingBrandLogoFramePreset,
  type BookingBrandingTokens,
} from "@/lib/bookingBranding";
import { cn } from "@/lib/utils";

type BookingBrandLogoProps = {
  businessName: string;
  branding?: Partial<BookingBrandingTokens> | null;
  logoUrl?: string | null;
  preset?: BookingBrandLogoFramePreset;
  applyTransform?: boolean;
  decorative?: boolean;
  className?: string;
  frameClassName?: string;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
};

export function BookingBrandLogo({
  businessName,
  branding,
  logoUrl,
  preset = "hero",
  applyTransform = true,
  decorative = false,
  className,
  frameClassName,
  onPointerDown,
}: BookingBrandLogoProps) {
  const tokens = normalizeBookingBranding(branding);
  const transform = tokens.logoTransform;
  const source = logoUrl ?? tokens.logoUrl;
  const frame = resolveBookingBrandLogoFrame(preset, transform.fitMode);
  const plate = resolveBookingBrandLogoPlateStyles(transform.backgroundPlate);
  const innerWidth = Math.max(1, frame.width - frame.padding * 2);
  const innerHeight = Math.max(1, frame.height - frame.padding * 2);
  const imageStyle = {
    left: frame.padding,
    top: frame.padding,
    width: innerWidth,
    height: innerHeight,
    objectFit: transform.fitMode === "cover" ? "cover" : "contain",
    filter: plate.imageFilter,
    transform: applyTransform
      ? `translate(${Math.round(transform.offsetX * innerWidth * bookingBrandLogoTranslationFactor * 100) / 100}px, ${Math.round(transform.offsetY * innerHeight * bookingBrandLogoTranslationFactor * 100) / 100}px) rotate(${transform.rotationDeg}deg) scale(${transform.zoom})`
      : undefined,
    transformOrigin: "center center",
  } satisfies CSSProperties;
  const monogram = (businessName.trim().slice(0, 1) || "S").toUpperCase();
  const alt = decorative ? "" : `${businessName.trim() || "Business"} logo`;
  const frameStyle = {
    width: frame.width,
    height: frame.height,
    borderRadius: frame.radius,
    background: plate.background,
    border: `1px solid ${plate.border}`,
    boxShadow: plate.shadow,
  } satisfies CSSProperties;

  return (
    <div className={cn("inline-flex", className)}>
      <div
        className={cn(
          "relative overflow-hidden",
          onPointerDown ? "cursor-grab active:cursor-grabbing touch-none" : "",
          frameClassName
        )}
        style={frameStyle}
        onPointerDown={onPointerDown}
      >
        {source ? (
          <img
            src={source}
            alt={alt}
            draggable={false}
            className="absolute select-none"
            style={imageStyle}
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: plate.monogramBackground,
              color: plate.monogramForeground,
            }}
          >
            <span className="text-2xl font-semibold tracking-[-0.05em]">{monogram}</span>
          </div>
        )}
      </div>
    </div>
  );
}
