function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function toMoneyNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const normalized = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(normalized) ? normalized : 0;
}

export function getDepositSummary(params: {
  totalPrice?: number | string | null;
  depositAmount?: number | string | null;
  depositPaid?: boolean | null;
  collectedAmount?: number | string | null;
  balanceDue?: number | string | null;
  paidInFull?: boolean | null;
  depositSatisfied?: boolean | null;
  labels?: {
    noun?: string;
    collectedStateLabel?: string;
    requiredStateLabel?: string;
    noCollectionStateLabel?: string;
    noCollectionDetail?: string;
    dueWhenInvoicedDetail?: (totalPrice: number) => string;
    collectedDetail?: (depositAmount: number, remainingBalance: number) => string;
    requiredDetail?: (depositAmount: number, totalPrice: number) => string;
  };
}) {
  const totalPrice = toMoneyNumber(params.totalPrice);
  const depositAmount = toMoneyNumber(params.depositAmount);
  const collectedAmount = Math.max(0, toMoneyNumber(params.collectedAmount));
  const backendBalanceDue = Math.max(0, toMoneyNumber(params.balanceDue));
  const paidInFull = params.paidInFull === true;
  const depositSatisfied = params.depositSatisfied === true;
  const depositPaid = params.depositPaid === true;
  const hasDeposit = depositAmount > 0;
  const hasBackendFinance =
    params.collectedAmount != null ||
    params.balanceDue != null ||
    params.paidInFull != null ||
    params.depositSatisfied != null;
  const remainingBalance = hasBackendFinance
    ? backendBalanceDue
    : hasDeposit && depositPaid
      ? Math.max(0, totalPrice - depositAmount)
      : totalPrice;
  const labels = params.labels ?? {};
  const noun = labels.noun ?? "deposit";
  const nounLabel = `${noun[0]?.toUpperCase() ?? "D"}${noun.slice(1)}`;

  if (!hasDeposit) {
    return {
      hasDeposit: false,
      depositAmount,
      remainingBalance,
      stateLabel: labels.noCollectionStateLabel ?? `No ${noun} required`,
      detail:
        totalPrice > 0
          ? labels.dueWhenInvoicedDetail?.(totalPrice) ?? `${formatCurrency(totalPrice)} due when invoiced.`
          : labels.noCollectionDetail ?? "This booking does not require upfront collection.",
    };
  }

  if ((hasBackendFinance && depositSatisfied) || (!hasBackendFinance && depositPaid)) {
    return {
      hasDeposit: true,
      depositAmount,
      remainingBalance,
      stateLabel: labels.collectedStateLabel ?? `${nounLabel} collected`,
      detail:
        labels.collectedDetail?.(depositAmount, remainingBalance) ??
        (remainingBalance > 0
          ? `${formatCurrency(depositAmount)} collected. ${formatCurrency(remainingBalance)} remains for invoicing.`
          : `${formatCurrency(depositAmount)} collected and no balance remains.`),
    };
  }

  if (hasBackendFinance && paidInFull) {
    return {
      hasDeposit,
      depositAmount,
      remainingBalance: 0,
      stateLabel: "Paid in full",
      detail: collectedAmount > 0 ? `${formatCurrency(collectedAmount)} has been collected for this appointment.` : "No balance remains on this appointment.",
    };
  }

  return {
    hasDeposit: true,
    depositAmount,
    remainingBalance,
    stateLabel: labels.requiredStateLabel ?? `${nounLabel} required`,
    detail:
      labels.requiredDetail?.(depositAmount, totalPrice) ??
      (totalPrice > 0
        ? `Collect ${formatCurrency(depositAmount)} before work starts. ${formatCurrency(totalPrice)} total booked value.`
        : `Collect ${formatCurrency(depositAmount)} before work starts.`),
  };
}

export function getInvoiceCollectionSummary(params: {
  status?: string | null;
  total?: number | string | null;
  totalPaid?: number | string | null;
  remainingBalance?: number | string | null;
  isOverdue?: boolean;
}) {
  const status = String(params.status ?? "");
  const total = toMoneyNumber(params.total);
  const totalPaid = toMoneyNumber(params.totalPaid);
  const remainingBalance = Math.max(0, toMoneyNumber(params.remainingBalance));
  const isOverdue = params.isOverdue === true;

  if (remainingBalance <= 0 || status === "paid") {
    return {
      title: "Fully collected",
      detail:
        totalPaid > 0
          ? `${formatCurrency(totalPaid)} received on this invoice. No balance remains.`
          : "No remaining balance on this invoice.",
    };
  }

  if (isOverdue) {
    return {
      title: "Overdue balance",
      detail: `Past due. ${formatCurrency(remainingBalance)} still needs collection follow-up.`,
    };
  }

  if (status === "partial") {
    return {
      title: "Partial payment collected",
      detail: `${formatCurrency(totalPaid)} received so far. ${formatCurrency(remainingBalance)} still due.`,
    };
  }

  if (status === "draft") {
    return {
      title: "Ready to send",
      detail: total > 0 ? `${formatCurrency(total)} ready to bill once the invoice is sent.` : "Send the invoice before collecting payment.",
    };
  }

  return {
    title: "Collect payment",
    detail: `${formatCurrency(remainingBalance)} is still due on this invoice.`,
  };
}
