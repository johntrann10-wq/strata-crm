import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const currentInvoice = await api.invoice.findOne(record.id, {
    select: { id: true, status: true },
  });
  if (currentInvoice.status === 'paid') {
    throw new Error('Cannot modify a paid invoice.');
  }
  if (currentInvoice.status === 'void') {
    throw new Error('Cannot modify a voided invoice.');
  }

  const taxRate = params.taxRate as number;
  if (typeof taxRate !== 'number' || isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
    throw new Error('Tax rate must be a number between 0 and 100.');
  }

  // Load all line items for this invoice and sum their totals
  const lineItems = await api.invoiceLineItem.findMany({
    filter: { invoiceId: { equals: record.id } },
    select: { id: true, total: true, taxable: true },
    first: 250,
  });

  const subtotal = lineItems.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const taxableSubtotal = lineItems.filter(item => item.taxable).reduce((sum, item) => sum + (item.total ?? 0), 0);
  const taxAmount = taxableSubtotal * (taxRate / 100);
  const cappedDiscount = Math.min(record.discountAmount ?? 0, subtotal + taxAmount);
  record.discountAmount = cappedDiscount;
  const total = Math.max(0, subtotal + taxAmount - cappedDiscount);

  record.taxRate = taxRate;
  record.subtotal = subtotal;
  record.taxAmount = taxAmount;
  record.total = total;

  await save(record);
};

export const params = {
  taxRate: { type: "number" },
};

export const options: ActionOptions = {
  actionType: "custom",
};
