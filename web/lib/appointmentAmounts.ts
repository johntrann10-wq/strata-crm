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

export function getDisplayedAppointmentAmount(appointment: AppointmentAmountLike): number {
  const subtotal = Math.max(0, toMoneyNumber(appointment.subtotal));
  const applyAdminFee = appointment.applyAdminFee === true;
  const applyTax = appointment.applyTax === true;

  const adminFeeAmount = applyAdminFee
    ? Math.max(
        0,
        toMoneyNumber(appointment.adminFeeAmount) > 0
          ? toMoneyNumber(appointment.adminFeeAmount)
          : subtotal * (Math.max(0, toMoneyNumber(appointment.adminFeeRate)) / 100)
      )
    : 0;

  const taxableSubtotal = subtotal + adminFeeAmount;
  const taxAmount = applyTax
    ? Math.max(
        0,
        toMoneyNumber(appointment.taxAmount) > 0
          ? toMoneyNumber(appointment.taxAmount)
          : taxableSubtotal * (Math.max(0, toMoneyNumber(appointment.taxRate)) / 100)
      )
    : 0;

  const computedTotal = Math.max(0, Number((subtotal + adminFeeAmount + taxAmount).toFixed(2)));
  const storedTotal = Math.max(0, toMoneyNumber(appointment.totalPrice));

  return computedTotal > 0 ? computedTotal : storedTotal;
}
