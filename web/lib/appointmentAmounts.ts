type MoneyLike = number | string | null | undefined;

export type AppointmentAmountLike = {
  subtotal?: MoneyLike;
  taxRate?: MoneyLike;
  taxAmount?: MoneyLike;
  applyTax?: boolean | null;
  adminFeeRate?: MoneyLike;
  adminFeeAmount?: MoneyLike;
  applyAdminFee?: boolean | null;
  totalPrice?: MoneyLike;
};

function toMoneyNumber(value: MoneyLike): number {
  if (value == null || value === "") return 0;
  const normalized = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(normalized) ? normalized : 0;
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Number(value.toFixed(2)));
}

export function getDisplayedAppointmentAmount(appointment: AppointmentAmountLike): number {
  const subtotal = roundMoney(toMoneyNumber(appointment.subtotal));
  const applyAdminFee = appointment.applyAdminFee === true;
  const applyTax = appointment.applyTax === true;
  const storedTotal = roundMoney(toMoneyNumber(appointment.totalPrice));
  const hasStructuredAmountInputs =
    subtotal > 0 ||
    applyAdminFee ||
    applyTax ||
    toMoneyNumber(appointment.adminFeeAmount) > 0 ||
    toMoneyNumber(appointment.taxAmount) > 0 ||
    toMoneyNumber(appointment.adminFeeRate) > 0 ||
    toMoneyNumber(appointment.taxRate) > 0;

  const adminFeeAmount = applyAdminFee
    ? roundMoney(
        toMoneyNumber(appointment.adminFeeAmount) > 0
          ? toMoneyNumber(appointment.adminFeeAmount)
          : subtotal * (Math.max(0, toMoneyNumber(appointment.adminFeeRate)) / 100)
      )
    : 0;

  const taxableSubtotal = roundMoney(subtotal + adminFeeAmount);
  const taxAmount = applyTax
    ? roundMoney(
        toMoneyNumber(appointment.taxAmount) > 0
          ? toMoneyNumber(appointment.taxAmount)
          : taxableSubtotal * (Math.max(0, toMoneyNumber(appointment.taxRate)) / 100)
      )
    : 0;

  const computedTotal = roundMoney(subtotal + adminFeeAmount + taxAmount);

  if (hasStructuredAmountInputs && computedTotal > 0) return computedTotal;
  if (storedTotal > 0) return storedTotal;
  return computedTotal;
}
