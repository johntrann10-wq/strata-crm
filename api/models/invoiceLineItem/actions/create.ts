import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record, { userBelongsToField: 'invoice.business' });

  // Guard: prevent adding line items to locked invoices
  if (record.invoiceId) {
    const invoice = await api.invoice.findOne(record.invoiceId as string, {
      select: { id: true, status: true },
    });
    if (invoice.status === "paid") {
      throw new Error("Cannot add line items to a paid invoice.");
    }
    if (invoice.status === "void") {
      throw new Error("Cannot add line items to a voided invoice.");
    }
    if (invoice.status === "partial") {
      throw new Error("Cannot add line items to an invoice that has recorded payments. Reverse payments first.");
    }
  }

  // Input validation
  const unitPrice = record.unitPrice ?? 0;
  const quantity = record.quantity ?? 1;
  if (unitPrice < 0) {
    throw new Error("Unit price cannot be negative.");
  }
  if (quantity < 1) {
    throw new Error("Quantity must be at least 1.");
  }
  if (
    unitPrice === 0 &&
    (record.description === undefined ||
      record.description === null ||
      (record.description as string).trim() === "")
  ) {
    throw new Error("A description is required for zero-price line items.");
  }

  // Sanitize description to prevent HTML injection
  if (record.description) {
    record.description = (record.description as string)
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  // Snapshot service name for historical integrity
  if (record.serviceId) {
    const service = await api.service.maybeFindOne(record.serviceId, {
      select: { name: true, price: true, taxable: true, category: true },
    });
    if (service === null) {
      logger.warn(
        { serviceId: record.serviceId },
        "Service not found when snapshotting line item — service may have been deleted"
      );
    } else {
      record.description = record.description || service.name;
      record.serviceSnapshot = {
        name: service.name,
        price: service.price,
        taxable: service.taxable,
        category: service.category,
      } as any;
    }
  }

  record.total = (record.quantity ?? 0) * (record.unitPrice ?? 0);
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api, connections }) => {
  const invoiceId = record.invoiceId;
  if (!invoiceId) return;

  const lineItems = await api.invoiceLineItem.findMany({
    filter: { invoiceId: { equals: invoiceId } },
    select: { id: true, total: true, taxable: true },
  });

  const subtotal = lineItems.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const taxableSubtotal = lineItems.reduce((sum, item) => item.taxable ? sum + (item.total ?? 0) : sum, 0);

  const invoice = await api.invoice.findOne(invoiceId, {
    select: { id: true, taxRate: true, discountAmount: true },
  });

  const taxAmount = taxableSubtotal * ((invoice.taxRate ?? 0) / 100);
  const total = Math.max(0, subtotal + taxAmount - (invoice.discountAmount ?? 0));

  await api.internal.invoice.update(invoiceId, {
    subtotal,
    taxAmount,
    total,
  });
};

export const options: ActionOptions = {
  actionType: "create",
};
