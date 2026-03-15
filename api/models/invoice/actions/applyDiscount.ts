import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  // Attack 7: Status guard
  const currentInvoice = await api.invoice.findOne(record.id, {
    select: { id: true, status: true },
  });
  if (currentInvoice.status === 'paid') {
    throw new Error('Cannot modify a paid invoice.');
  }
  if (currentInvoice.status === 'void') {
    throw new Error('Cannot modify a voided invoice.');
  }

  const discountAmount: number = (params.discountAmount as number) ?? 0;

  // Attack 9: Non-negative validation
  if (typeof discountAmount !== 'number' || isNaN(discountAmount) || discountAmount < 0) {
    throw new Error('Discount amount must be a non-negative number.');
  }

  // Load all line items for this invoice
  const lineItems = await api.invoiceLineItem.findMany({
    filter: { invoiceId: { equals: record.id } },
    select: { id: true, total: true, taxable: true },
    first: 250,
  });

  // Sum line item totals to get subtotal
  const subtotal = lineItems.reduce((sum, item) => sum + (item.total ?? 0), 0);

  // Compute tax amount on taxable items only
  const taxableSubtotal = lineItems.filter(item => item.taxable).reduce((sum, item) => sum + (item.total ?? 0), 0);
  const taxAmount = taxableSubtotal * ((record.taxRate ?? 0) / 100);

  // Cap discount at subtotal + taxAmount
  const cappedDiscount = Math.min(discountAmount, subtotal + taxAmount);

  // Compute total, floored at 0
  const total = Math.max(0, subtotal + taxAmount - cappedDiscount);

  record.discountAmount = cappedDiscount;
  record.subtotal = subtotal;
  record.taxAmount = taxAmount;
  record.total = total;

  await save(record);
};

export const params = {
  discountAmount: { type: "number" },
};

export const options: ActionOptions = {
  actionType: "custom",
};
