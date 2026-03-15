import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record);

  const quote = record.quoteId ? await api.quote.maybeFindOne(record.quoteId as string, { select: { id: true, status: true } }) : null;

  if (quote?.status === "accepted") {
    throw new Error("Cannot modify line items on an accepted quote.");
  }
  if (quote?.status === "declined") {
    throw new Error("Cannot modify line items on a declined quote.");
  }
  if (quote?.status === "sent") {
    throw new Error("Cannot modify line items on a sent quote. Mark it as declined and create a new quote instead.");
  }

  record.total = (record.quantity ?? 1) * (record.unitPrice ?? 0);
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api }) => {
  const quoteId = record.quoteId as string | undefined;
  if (!quoteId) return;

  try {
    const lineItems = await api.quoteLineItem.findMany({
      filter: { quoteId: { equals: quoteId } },
      select: { id: true, total: true, taxable: true },
      first: 250,
    });

    const subtotal = lineItems.reduce((sum, item) => sum + (item.total ?? 0), 0);

    const quote = await api.quote.findOne(quoteId, { select: { id: true, taxRate: true } });
    const taxRate = quote.taxRate ?? 0;

    const taxableSubtotal = lineItems.reduce(
      (sum, item) => (item.taxable ? sum + (item.total ?? 0) : sum),
      0
    );

    const taxAmount = taxableSubtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    await api.internal.quote.update(quoteId, { subtotal, taxAmount, total });
  } catch (error) {
    logger.warn({ error }, "Failed to recalculate quote totals after line item update");
  }
};

export const options: ActionOptions = {
  actionType: "update",
};
