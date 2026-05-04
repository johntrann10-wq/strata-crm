import * as React from "react";

import { Input } from "@/components/ui/input";
import { formatPhoneNumberInput, US_PHONE_DISPLAY_LENGTH } from "@/lib/phone";

type PhoneInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

export function PhoneInput({ value, onChange, onBlur, ...props }: PhoneInputProps) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="numeric"
      autoComplete={props.autoComplete ?? "tel"}
      maxLength={US_PHONE_DISPLAY_LENGTH}
      value={formatPhoneNumberInput(value)}
      onChange={(event) => onChange(formatPhoneNumberInput(event.target.value))}
      onBlur={(event) => {
        onChange(formatPhoneNumberInput(event.target.value));
        onBlur?.(event);
      }}
    />
  );
}
