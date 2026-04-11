export type AppointmentFinanceActivityLike = {
  action?: string | null;
  type?: string | null;
  metadata?: string | null;
};

export type AppointmentFinanceSource = {
  totalPrice?: number | string | null;
  depositAmount?: number | string | null;
  paidAt?: string | Date | null;
  invoiceStatus?: string | null;
  invoicePaidAt?: string | Date | null;
  collectedAmount?: number | string | null;
  balanceDue?: number | string | null;
  paidInFull?: boolean | null;
  depositSatisfied?: boolean | null;
};

function toMoneyNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const normalized = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(normalized) ? normalized : 0;
}

function hasValidPaidAt(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

export function hasBackendFinanceField(
  appointment: Record<string, unknown>,
  field: "collectedAmount" | "balanceDue" | "paidInFull" | "depositSatisfied"
): boolean {
  return Object.prototype.hasOwnProperty.call(appointment, field) && appointment[field] != null;
}

function getPaymentActivityType(entry: AppointmentFinanceActivityLike): string {
  return String(entry.type ?? entry.action ?? "");
}

function getCollectedAmountFromActivity(
  appointment: AppointmentFinanceSource,
  activityLogs: AppointmentFinanceActivityLike[]
): number | null {
  const relevantLogs = activityLogs.filter((entry) => {
    const activityType = getPaymentActivityType(entry);
    return activityType === "appointment.deposit_paid" || activityType === "appointment.deposit_payment_reversed";
  });
  if (relevantLogs.length === 0) return null;

  let total = 0;
  for (const entry of relevantLogs) {
    let amount = 0;
    try {
      const parsed = entry.metadata ? (JSON.parse(entry.metadata) as { amount?: number | string | null }) : null;
      amount = Number(parsed?.amount ?? 0);
    } catch {
      amount = 0;
    }
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const activityType = getPaymentActivityType(entry);
    if (activityType === "appointment.deposit_paid") total += amount;
    if (activityType === "appointment.deposit_payment_reversed") total -= amount;
  }

  const totalPrice = toMoneyNumber(appointment.totalPrice);
  const clamped = Math.max(0, total);
  return totalPrice > 0 ? Math.min(totalPrice, clamped) : clamped;
}

export function resolveAppointmentFinanceState(
  appointment: AppointmentFinanceSource & Record<string, unknown>,
  activityLogs: AppointmentFinanceActivityLike[] = []
) {
  const totalAmount = toMoneyNumber(appointment.totalPrice);
  const depositAmount = toMoneyNumber(appointment.depositAmount);
  const hasBackendCollectedAmount = hasBackendFinanceField(appointment, "collectedAmount");
  const hasBackendBalanceDue = hasBackendFinanceField(appointment, "balanceDue");
  const hasBackendPaidInFull = hasBackendFinanceField(appointment, "paidInFull");
  const hasBackendDepositSatisfied = hasBackendFinanceField(appointment, "depositSatisfied");
  const backendCollectedAmount = toMoneyNumber(appointment.collectedAmount);
  const backendBalanceDue = toMoneyNumber(appointment.balanceDue);
  const backendPaidInFull = appointment.paidInFull === true;
  const backendDepositSatisfied = appointment.depositSatisfied === true;

  const paidInFull = hasBackendPaidInFull
    ? backendPaidInFull
    : hasValidPaidAt(appointment.paidAt) ||
      String(appointment.invoiceStatus ?? "") === "paid" ||
      hasValidPaidAt(appointment.invoicePaidAt);

  const activityCollectedAmount =
    hasBackendCollectedAmount || hasBackendBalanceDue || hasBackendPaidInFull || hasBackendDepositSatisfied
      ? null
      : getCollectedAmountFromActivity(appointment, activityLogs);

  const collectedAmount = hasBackendCollectedAmount
    ? Math.max(0, Number(backendCollectedAmount.toFixed(2)))
    : paidInFull
      ? Math.max(0, totalAmount)
      : Math.max(0, Number(((activityCollectedAmount ?? 0) > 0 ? (activityCollectedAmount ?? 0) : 0).toFixed(2)));

  const balanceDue =
    hasBackendBalanceDue
      ? Math.max(0, Number(backendBalanceDue.toFixed(2)))
      : totalAmount > 0
        ? Math.max(0, Number((totalAmount - collectedAmount).toFixed(2)))
        : 0;

  const hasAnyPayment = collectedAmount > 0.009 || paidInFull;
  const isPaidInFull = (totalAmount > 0 && balanceDue <= 0.009 && hasAnyPayment) || paidInFull;
  const depositSatisfied = hasBackendDepositSatisfied ? backendDepositSatisfied : depositAmount > 0 && hasAnyPayment;
  const nextCollectionAmount =
    totalAmount > 0
      ? hasAnyPayment
        ? balanceDue
        : depositAmount > 0
          ? Math.min(totalAmount, depositAmount)
          : totalAmount
      : depositAmount > 0 && !hasAnyPayment
        ? depositAmount
        : 0;

  return {
    totalAmount,
    depositAmount,
    collectedAmount,
    balanceDue,
    paidInFull,
    depositSatisfied,
    hasAnyPayment,
    isPaidInFull,
    nextCollectionAmount,
    hasBackendCollectedAmount,
    hasBackendBalanceDue,
    hasBackendPaidInFull,
    hasBackendDepositSatisfied,
  };
}
