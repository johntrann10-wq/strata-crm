import * as React from "react";

import { Input } from "@/components/ui/input";
import { formatPhoneNumberInput, US_PHONE_DISPLAY_LENGTH } from "@/lib/phone";

type PhoneInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

function getRawPhoneDigits(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function PhoneInput({ value, onChange, onBlur, onBeforeInput, onPaste, ...props }: PhoneInputProps) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      pattern="[0-9]*"
      autoComplete={props.autoComplete ?? "tel"}
      maxLength={US_PHONE_DISPLAY_LENGTH}
      value={formatPhoneNumberInput(value)}
      onBeforeInput={(event) => {
        const nativeEvent = event.nativeEvent as InputEvent;
        const nextData = nativeEvent.data ?? "";
        if (nextData && /\d/.test(nextData)) {
          const input = event.currentTarget;
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? input.value.length;
          const nextValue = `${input.value.slice(0, start)}${nextData}${input.value.slice(end)}`;
          if (getRawPhoneDigits(nextValue).length > 10) {
            event.preventDefault();
            return;
          }
        }
        onBeforeInput?.(event);
      }}
      onPaste={(event) => {
        event.preventDefault();
        const input = event.currentTarget;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const pastedValue = event.clipboardData.getData("text");
        const nextValue = `${input.value.slice(0, start)}${pastedValue}${input.value.slice(end)}`;
        onChange(formatPhoneNumberInput(nextValue));
        onPaste?.(event);
      }}
      onChange={(event) => onChange(formatPhoneNumberInput(event.target.value))}
      onBlur={(event) => {
        onChange(formatPhoneNumberInput(event.target.value));
        onBlur?.(event);
      }}
    />
  );
}
