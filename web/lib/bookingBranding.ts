import type { CSSProperties } from "react";

export const bookingBrandPrimaryColorTokens = ["orange", "sky", "emerald", "rose", "slate"] as const;
export const bookingBrandAccentColorTokens = ["amber", "blue", "mint", "violet", "stone"] as const;
export const bookingBrandBackgroundToneTokens = ["ivory", "mist", "sand", "slate"] as const;
export const bookingBrandButtonStyleTokens = ["solid", "soft", "outline"] as const;

export type BookingBrandPrimaryColorToken = (typeof bookingBrandPrimaryColorTokens)[number];
export type BookingBrandAccentColorToken = (typeof bookingBrandAccentColorTokens)[number];
export type BookingBrandBackgroundToneToken = (typeof bookingBrandBackgroundToneTokens)[number];
export type BookingBrandButtonStyleToken = (typeof bookingBrandButtonStyleTokens)[number];

export type BookingBrandingTokens = {
  logoUrl: string | null;
  primaryColorToken: BookingBrandPrimaryColorToken;
  accentColorToken: BookingBrandAccentColorToken;
  backgroundToneToken: BookingBrandBackgroundToneToken;
  buttonStyleToken: BookingBrandButtonStyleToken;
};

const primaryPalettes: Record<
  BookingBrandPrimaryColorToken,
  {
    solid: string;
    solidStrong: string;
    foreground: string;
    soft: string;
    softBorder: string;
    ink: string;
  }
> = {
  orange: {
    solid: "#ea580c",
    solidStrong: "#c2410c",
    foreground: "#ffffff",
    soft: "#fff7ed",
    softBorder: "#fdba74",
    ink: "#9a3412",
  },
  sky: {
    solid: "#0284c7",
    solidStrong: "#0369a1",
    foreground: "#ffffff",
    soft: "#f0f9ff",
    softBorder: "#7dd3fc",
    ink: "#0c4a6e",
  },
  emerald: {
    solid: "#059669",
    solidStrong: "#047857",
    foreground: "#ffffff",
    soft: "#ecfdf5",
    softBorder: "#6ee7b7",
    ink: "#065f46",
  },
  rose: {
    solid: "#e11d48",
    solidStrong: "#be123c",
    foreground: "#ffffff",
    soft: "#fff1f2",
    softBorder: "#fda4af",
    ink: "#9f1239",
  },
  slate: {
    solid: "#0f172a",
    solidStrong: "#020617",
    foreground: "#ffffff",
    soft: "#f8fafc",
    softBorder: "#cbd5e1",
    ink: "#0f172a",
  },
};

const accentPalettes: Record<
  BookingBrandAccentColorToken,
  {
    soft: string;
    border: string;
    ink: string;
    iconSoft: string;
  }
> = {
  amber: {
    soft: "#fffbeb",
    border: "#fcd34d",
    ink: "#92400e",
    iconSoft: "#fef3c7",
  },
  blue: {
    soft: "#eff6ff",
    border: "#93c5fd",
    ink: "#1d4ed8",
    iconSoft: "#dbeafe",
  },
  mint: {
    soft: "#ecfdf5",
    border: "#86efac",
    ink: "#047857",
    iconSoft: "#d1fae5",
  },
  violet: {
    soft: "#f5f3ff",
    border: "#c4b5fd",
    ink: "#6d28d9",
    iconSoft: "#ede9fe",
  },
  stone: {
    soft: "#fafaf9",
    border: "#d6d3d1",
    ink: "#57534e",
    iconSoft: "#f5f5f4",
  },
};

const backgroundTones: Record<
  BookingBrandBackgroundToneToken,
  {
    page: string;
    pageMuted: string;
    halo: string;
    summary: string;
  }
> = {
  ivory: {
    page: "#fffdf8",
    pageMuted: "#f8fafc",
    halo: "rgba(249, 115, 22, 0.10)",
    summary: "#fffefb",
  },
  mist: {
    page: "#f8fbff",
    pageMuted: "#eef5ff",
    halo: "rgba(14, 165, 233, 0.10)",
    summary: "#fbfdff",
  },
  sand: {
    page: "#fcfaf6",
    pageMuted: "#f7f2ea",
    halo: "rgba(180, 83, 9, 0.09)",
    summary: "#fffdf9",
  },
  slate: {
    page: "#f8fafc",
    pageMuted: "#eef2f7",
    halo: "rgba(15, 23, 42, 0.08)",
    summary: "#ffffff",
  },
};

export const bookingBrandPrimaryColorOptions: Array<{ value: BookingBrandPrimaryColorToken; label: string }> = [
  { value: "orange", label: "Orange" },
  { value: "sky", label: "Sky" },
  { value: "emerald", label: "Emerald" },
  { value: "rose", label: "Rose" },
  { value: "slate", label: "Slate" },
];

export const bookingBrandAccentColorOptions: Array<{ value: BookingBrandAccentColorToken; label: string }> = [
  { value: "amber", label: "Amber" },
  { value: "blue", label: "Blue" },
  { value: "mint", label: "Mint" },
  { value: "violet", label: "Violet" },
  { value: "stone", label: "Stone" },
];

export const bookingBrandBackgroundToneOptions: Array<{ value: BookingBrandBackgroundToneToken; label: string }> = [
  { value: "ivory", label: "Ivory" },
  { value: "mist", label: "Mist" },
  { value: "sand", label: "Sand" },
  { value: "slate", label: "Slate" },
];

export const bookingBrandButtonStyleOptions: Array<{ value: BookingBrandButtonStyleToken; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "soft", label: "Soft" },
  { value: "outline", label: "Outline" },
];

export const defaultBookingBranding: BookingBrandingTokens = {
  logoUrl: null,
  primaryColorToken: "orange",
  accentColorToken: "amber",
  backgroundToneToken: "ivory",
  buttonStyleToken: "solid",
};

export function normalizeBookingBranding(
  value?: Partial<BookingBrandingTokens> | null
): BookingBrandingTokens {
  const primaryColorTokenCandidate = value?.primaryColorToken;
  const accentColorTokenCandidate = value?.accentColorToken;
  const backgroundToneTokenCandidate = value?.backgroundToneToken;
  const buttonStyleTokenCandidate = value?.buttonStyleToken;

  return {
    logoUrl: value?.logoUrl?.trim() || null,
    primaryColorToken:
      primaryColorTokenCandidate && bookingBrandPrimaryColorTokens.includes(primaryColorTokenCandidate)
        ? primaryColorTokenCandidate
        : defaultBookingBranding.primaryColorToken,
    accentColorToken:
      accentColorTokenCandidate && bookingBrandAccentColorTokens.includes(accentColorTokenCandidate)
        ? accentColorTokenCandidate
        : defaultBookingBranding.accentColorToken,
    backgroundToneToken:
      backgroundToneTokenCandidate && bookingBrandBackgroundToneTokens.includes(backgroundToneTokenCandidate)
        ? backgroundToneTokenCandidate
        : defaultBookingBranding.backgroundToneToken,
    buttonStyleToken:
      buttonStyleTokenCandidate && bookingBrandButtonStyleTokens.includes(buttonStyleTokenCandidate)
        ? buttonStyleTokenCandidate
        : defaultBookingBranding.buttonStyleToken,
  };
}

export function resolveBookingBrandTheme(value?: Partial<BookingBrandingTokens> | null): {
  tokens: BookingBrandingTokens;
  style: CSSProperties;
  primaryButtonClassName: string;
} {
  const tokens = normalizeBookingBranding(value);
  const primary = primaryPalettes[tokens.primaryColorToken];
  const accent = accentPalettes[tokens.accentColorToken];
  const background = backgroundTones[tokens.backgroundToneToken];

  const style = {
    "--booking-primary": primary.solid,
    "--booking-primary-strong": primary.solidStrong,
    "--booking-primary-foreground": primary.foreground,
    "--booking-primary-soft": primary.soft,
    "--booking-primary-soft-border": primary.softBorder,
    "--booking-primary-ink": primary.ink,
    "--booking-accent-soft": accent.soft,
    "--booking-accent-border": accent.border,
    "--booking-accent-ink": accent.ink,
    "--booking-accent-icon-soft": accent.iconSoft,
    "--booking-page": background.page,
    "--booking-page-muted": background.pageMuted,
    "--booking-page-halo": background.halo,
    "--booking-summary": background.summary,
  } as CSSProperties;

  const primaryButtonClassName =
    tokens.buttonStyleToken === "soft"
      ? "border border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)] text-[color:var(--booking-primary-ink)] hover:bg-[color:var(--booking-primary-soft)]/80"
      : tokens.buttonStyleToken === "outline"
        ? "border border-[color:var(--booking-primary-soft-border)] bg-white text-[color:var(--booking-primary-ink)] hover:bg-[var(--booking-primary-soft)]"
        : "border border-transparent bg-[var(--booking-primary)] text-[color:var(--booking-primary-foreground)] hover:bg-[var(--booking-primary-strong)]";

  return {
    tokens,
    style,
    primaryButtonClassName,
  };
}
