export function calculateLineItemTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}

export function calculateInvoiceTotals(
  lineItems: Array<{ total: number; taxable?: boolean }>,
  taxRate: number,
  discountAmount: number
): { subtotal: number; taxableSubtotal: number; taxAmount: number; total: number } {
  const subtotal = Math.round(lineItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100;

  const taxableSubtotal =
    Math.round(
      lineItems
        .filter((item) => item.taxable !== false)
        .reduce((sum, item) => sum + item.total, 0) * 100
    ) / 100;

  const taxAmount = Math.round(taxableSubtotal * (taxRate / 100) * 100) / 100;

  const rawTotal = subtotal + taxAmount - discountAmount;
  const total = Math.round(Math.max(0, rawTotal) * 100) / 100;

  return { subtotal, taxableSubtotal, taxAmount, total };
}

export function generateInvoiceNumber(businessId: string, existingCount: number): string {
  const year = new Date().getFullYear();
  const sequence = String(existingCount + 1).padStart(4, "0");
  return `INV-${year}-${sequence}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}