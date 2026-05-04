export const US_PHONE_DIGIT_COUNT = 10;
export const US_PHONE_DISPLAY_LENGTH = 14;

export function getPhoneInputDigits(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  const withoutCountryCode = digits.length > US_PHONE_DIGIT_COUNT && digits.startsWith("1") ? digits.slice(1) : digits;
  return withoutCountryCode.slice(0, US_PHONE_DIGIT_COUNT);
}

export function formatPhoneNumberInput(value: string | null | undefined): string {
  const digits = getPhoneInputDigits(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function isCompletePhoneNumberInput(value: string | null | undefined): boolean {
  const digits = getPhoneInputDigits(value);
  return digits.length === 0 || digits.length === US_PHONE_DIGIT_COUNT;
}

export function getPhoneNumberInputError(value: string | null | undefined, label = "Phone number"): string | null {
  const digits = getPhoneInputDigits(value);
  if (digits.length === 0 || digits.length === US_PHONE_DIGIT_COUNT) return null;
  return `${label} must include a 10-digit phone number.`;
}
