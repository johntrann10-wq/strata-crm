import { deleteRecord, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "invoice.business" });
  const invoiceId = record.invoiceId as string | undefined;
  if (invoiceId) {
    const invoice = await api.invoice.findOne(invoiceId, { select: { id: true, status: true } });
    if (invoice.status === "paid") {
      throw new Error("Cannot remove line items from a paid invoice. The financial record is locked.");
    }
    if (invoice.status === "void") {
      throw new Error("Cannot modify a voided invoice.");
    }
    if (invoice.status === "partial") {
      const invoiceDetails = await api.invoice.findOne(invoiceId, { select: { taxRate: true, discountAmount: true } });

      const remainingItems = await api.invoiceLineItem.findMany({
        filter: {
          invoiceId: { equals: invoiceId },
          id: { notEquals: record.id },
        },
        select: { id: true, total: true, taxable: true },
        first: 250,
      });

      const prospectiveSubtotal = remainingItems.reduce((sum, item) => sum + (item.total ?? 0), 0);
      const taxRate = invoiceDetails.taxRate ?? 0;
      const discountAmount = invoiceDetails.discountAmount ?? 0;

      const taxableSubtotal = remainingItems
        .filter((item) => item.taxable)
        .reduce((sum, item) => sum + (item.total ?? 0), 0);

      const taxAmount = taxableSubtotal * (taxRate / 100);
      const prospectiveTotal = prospectiveSubtotal - discountAmount + taxAmount;

      const payments = await api.payment.findMany({
        filter: { invoiceId: { equals: invoiceId } },
        select: { id: true, amount: true },
        first: 250,
      });

      const totalPaid = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);

      if (totalPaid > prospectiveTotal + 0.001) {
        throw new Error(
          "Cannot delete this line item: the new invoice total would be less than payments already recorded. Reverse payments first."
        );
      }
    }
  }
  await deleteRecord(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api, connections }) => {
  const invoiceId = record.invoiceId as string | undefined;
  if (!invoiceId) return;

  // Load all remaining line items for this invoice after deletion
  const lineItems = await api.invoiceLineItem.findMany({
    filter: { invoiceId: { equals: invoiceId } },
    select: { id: true, total: true, taxable: true },
    first: 250,
  });

  // Load the invoice to get the tax rate and discount
  const invoice = await api.invoice.findOne(invoiceId, {
    select: { id: true, taxRate: true, discountAmount: true },
  });

  const subtotal = lineItems.reduce((sum, item) => sum + (item.total ?? 0), 0);

  const taxRate = invoice.taxRate ?? 0;
  const discountAmount = invoice.discountAmount ?? 0;

  const taxableSubtotal = lineItems
    .filter((item) => item.taxable)
    .reduce((sum, item) => sum + (item.total ?? 0), 0);

  const taxAmount = taxableSubtotal * (taxRate / 100);
  const total = Math.max(0, subtotal - discountAmount + taxAmount);

  await api.internal.invoice.update(invoiceId, {
    subtotal,
    taxAmount,
    total,
  });
};

export const options: ActionOptions = {
  actionType: "delete",
};
