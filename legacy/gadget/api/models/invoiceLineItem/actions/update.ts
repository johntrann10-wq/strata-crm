import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  const invoice = await api.invoice.findOne(record.invoiceId as string, {
    select: { id: true, status: true, taxRate: true, discountAmount: true },
  });

  if (invoice.status === "paid") {
    throw new Error("Cannot edit line items on a paid invoice. The financial record is locked.");
  }
  if (invoice.status === "void") {
    throw new Error("Cannot modify a voided invoice.");
  }
  if (invoice.status === "partial") {
    throw new Error("Cannot edit line items on an invoice that has recorded payments. Reverse payments first.");
  }

  applyParams(params, record);
  await preventCrossUserDataAccess(params, record, { userBelongsToField: 'invoice.business' });

  const newLineTotal = (record.quantity ?? 0) * (record.unitPrice ?? 0);

  const otherItems = await api.invoiceLineItem.findMany({
    filter: { AND: [{ invoiceId: { equals: record.invoiceId } }, { id: { notEquals: record.id } }] },
    select: { id: true, total: true, taxable: true },
    first: 250,
  });

  const prospectiveSubtotal = otherItems.reduce((sum, item) => sum + (item.total ?? 0), 0) + newLineTotal;
  const taxRate = invoice.taxRate ?? 0;
  const discountAmount = invoice.discountAmount ?? 0;
  const prospectiveTaxableSubtotal =
    otherItems.filter((item) => item.taxable).reduce((sum, item) => sum + (item.total ?? 0), 0) +
    newLineTotal * (record.taxable !== false ? 1 : 0);
  const prospectiveTaxAmount = prospectiveTaxableSubtotal * (taxRate / 100);
  const cappedDiscount = Math.min(discountAmount, prospectiveSubtotal + prospectiveTaxAmount);
  const prospectiveTotal = Math.max(0, prospectiveSubtotal + prospectiveTaxAmount - cappedDiscount);

  const payments = await api.payment.findMany({
    filter: { invoiceId: { equals: record.invoiceId } },
    select: { id: true, amount: true },
    first: 250,
  });

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  if (totalPaid > prospectiveTotal + 0.001) {
    throw new Error("Cannot reduce line item value: the new invoice total would be less than payments already recorded. Reverse payments first.");
  }

  record.total = newLineTotal;

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api, connections }) => {
  const lineItems = await api.invoiceLineItem.findMany({
    filter: { invoiceId: { equals: record.invoiceId } },
    select: { id: true, total: true, taxable: true },
  });

  const subtotal = lineItems.reduce((sum, item) => sum + (item.total ?? 0), 0);

  const invoice = await api.invoice.findOne(record.invoiceId as string, {
    select: { id: true, taxRate: true, discountAmount: true },
  });

  const taxRate = invoice.taxRate ?? 0;
  const discountAmount = invoice.discountAmount ?? 0;

  const taxableSubtotal = lineItems
    .filter((item) => item.taxable)
    .reduce((sum, item) => sum + (item.total ?? 0), 0);

  const taxAmount = taxableSubtotal * (taxRate / 100);
  const total = Math.max(0, subtotal - discountAmount + taxAmount);

  await api.internal.invoice.update(record.invoiceId as string, {
    subtotal,
    taxAmount,
    total,
  });
};

export const options: ActionOptions = {
  actionType: "update",
};
