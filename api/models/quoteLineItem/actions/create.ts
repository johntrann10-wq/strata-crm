import { applyParams, save, ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, record, logger, api }) => {
  applyParams(params, record);

  if (record.serviceId) {
    try {
      const service = await api.service.findOne(record.serviceId, {
        select: { id: true, name: true, price: true, taxable: true, category: true },
      });

      record.serviceSnapshot = {
        name: service.name,
        price: service.price,
        taxable: service.taxable,
        category: service.category,
      } as any;

      if (!record.description) {
        record.description = service.name;
      }
    } catch (error) {
      logger.warn({ error, serviceId: record.serviceId }, "Failed to load service for snapshot");
    }
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

    const quote = await api.quote.findOne(quoteId, {
      select: { id: true, taxRate: true },
    });

    const taxRate = quote.taxRate ?? 0;
    const taxableSubtotal = lineItems
      .filter((item) => item.taxable === true)
      .reduce((sum, item) => sum + (item.total ?? 0), 0);

    const taxAmount = taxableSubtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    await api.internal.quote.update(quoteId, { subtotal, taxAmount, total });
  } catch (error) {
    logger.warn({ error, quoteId }, "Failed to recalculate quote totals after line item create");
  }
};

export const options: ActionOptions = {
  actionType: "create",
};
