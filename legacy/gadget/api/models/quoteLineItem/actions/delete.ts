import { deleteRecord, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record);

  const quote = record.quoteId
    ? await api.quote.maybeFindOne(record.quoteId as string, { select: { id: true, status: true } })
    : null;

  if (quote?.status === "accepted") {
    throw new Error("Cannot delete line items from an accepted quote.");
  }

  if (quote?.status === "sent") {
    throw new Error(
      "Cannot delete line items from a sent quote. Mark it as declined and create a new quote instead."
    );
  }

  await deleteRecord(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api, connections }) => {
  const quoteId = record.quoteId as string | undefined;
  if (!quoteId) return;

  try {
    const remainingItems = await api.quoteLineItem.findMany({
      filter: {
        quoteId: { equals: quoteId },
        id: { notEquals: record.id },
      },
      select: {
        id: true,
        total: true,
        taxable: true,
      },
      first: 250,
    });

    const subtotal = remainingItems.reduce((sum, item) => sum + (item.total ?? 0), 0);

    const quote = await api.quote.findOne(quoteId, {
      select: { id: true, taxRate: true },
    });

    const taxRate = quote.taxRate ?? 0;
    const taxableSubtotal = remainingItems
      .filter((item) => item.taxable === true)
      .reduce((sum, item) => sum + (item.total ?? 0), 0);

    const taxAmount = taxableSubtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    await api.internal.quote.update(quoteId, { subtotal, taxAmount, total });
  } catch (error) {
    logger.warn({ error }, "Failed to recalculate quote totals after line item deletion");
  }
};

export const options: ActionOptions = {
  actionType: "delete",
};
