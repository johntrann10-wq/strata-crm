import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const current = await api.invoice.findOne(record.id, { select: { id: true, status: true, updatedAt: true } });

  if (record.updatedAt && current.updatedAt && record.updatedAt.getTime() !== current.updatedAt.getTime()) {
    throw new Error("This invoice was modified by another user. Please refresh and try again.");
  }

  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    draft: ["sent", "void"],
    sent: ["draft", "void"],
    partial: ["void"],
    paid: [],
    void: [],
  };

  const changes = record.changes();

  if (changes.status !== undefined && changes.status.current !== changes.status.previous) {
    const fromStatus = current.status ?? "draft";
    const toStatus = record.status as string;

    if (toStatus === "paid" || toStatus === "partial") {
      throw new Error("Invoice status cannot be manually set to paid or partial. Record a payment instead.");
    }

    const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new Error(`Invalid status transition: cannot move invoice from ${fromStatus} to ${toStatus}.`);
    }

    if (fromStatus === "partial" && toStatus === "void") {
      const payments = await api.payment.findMany({
        filter: { invoice: { id: { equals: record.id } } },
        select: { id: true, amount: true },
        first: 250,
      });
      const totalPaid = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
      if (totalPaid > 0) {
        throw new Error(
          `Cannot void an invoice with recorded payments ($${totalPaid.toFixed(2)} paid). Use the Void Invoice action which requires reversing payments first.`
        );
      }
    }
  }

  if (current.status === "paid" || current.status === "void" || current.status === "partial") {
    const financialFields = ["subtotal", "taxAmount", "total", "discountAmount", "taxRate", "paidAt"] as const;
    for (const field of financialFields) {
      const fieldChange = (changes as Record<string, { current: unknown; previous: unknown } | undefined>)[field];
      if (fieldChange !== undefined && fieldChange.current !== fieldChange.previous) {
        throw new Error("Cannot modify financial fields on a paid or voided invoice.");
      }
    }
  }

  if (
    (changes.taxRate !== undefined && changes.taxRate.current !== changes.taxRate.previous) ||
    (changes.discountAmount !== undefined && changes.discountAmount.current !== changes.discountAmount.previous)
  ) {
    const lineItems = await api.invoiceLineItem.findMany({
      filter: { invoiceId: { equals: record.id } },
      select: { id: true, total: true, taxable: true },
      first: 250,
    });

    const subtotal = lineItems.reduce((sum, item) => sum + (item.total ?? 0), 0);
    const taxableSubtotal = lineItems.reduce((sum, item) => sum + (item.taxable ? (item.total ?? 0) : 0), 0);
    const taxAmount = taxableSubtotal * ((record.taxRate ?? 0) / 100);
    const cappedDiscount = Math.min(record.discountAmount ?? 0, subtotal + taxAmount);
    record.discountAmount = cappedDiscount;
    const total = Math.max(0, subtotal + taxAmount - cappedDiscount);

    record.subtotal = subtotal;
    record.taxAmount = taxAmount;
    record.total = total;
  }

  await save(record);
};

export const options: ActionOptions = {
  actionType: "update",
};
