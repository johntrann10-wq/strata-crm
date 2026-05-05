import * as React from "react";

import { Input } from "@/components/ui/input";
import { formatPhoneNumberInput, getPhoneInputDigits, US_PHONE_DISPLAY_LENGTH } from "@/lib/phone";

type PhoneInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

function getNextPhoneDigits(element: HTMLInputElement, insertedText: string) {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  const nextValue = `${element.value.slice(0, start)}${insertedText}${element.value.slice(end)}`;
  return getPhoneInputDigits(nextValue);
}

function getNextRawPhoneDigitCount(element: HTMLInputElement, insertedText: string) {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  const nextValue = `${element.value.slice(0, start)}${insertedText}${element.value.slice(end)}`;
  const digits = nextValue.replace(/\D/g, "");
  const withoutCountryCode = digits.length > 10 && digits.startsWith("1") ? digits.slice(1) : digits;
  return withoutCountryCode.length;
}

export function PhoneInput({ value, onChange, onBlur, onBeforeInput, onPaste, ...props }: PhoneInputProps) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      autoComplete={props.autoComplete ?? "tel"}
      maxLength={US_PHONE_DISPLAY_LENGTH}
      value={formatPhoneNumberInput(value)}
      onBeforeInput={(event) => {
        onBeforeInput?.(event);
        if (event.defaultPrevented) return;
        const nativeEvent = event.nativeEvent as InputEvent;
        const insertedText = nativeEvent.data ?? "";
        if (!insertedText) return;
        if (/\D/.test(insertedText) || getNextRawPhoneDigitCount(event.currentTarget, insertedText) > 10) {
          event.preventDefault();
        }
      }}
      onPaste={(event) => {
        onPaste?.(event);
        if (event.defaultPrevented) return;
        const pastedText = event.clipboardData.getData("text");
        if (!pastedText) return;
        event.preventDefault();
        onChange(formatPhoneNumberInput(getNextPhoneDigits(event.currentTarget, pastedText)));
      }}
      onChange={(event) => onChange(formatPhoneNumberInput(event.target.value))}
      onBlur={(event) => {
        onChange(formatPhoneNumberInput(event.target.value));
        onBlur?.(event);
      }}
    />
  );
}
