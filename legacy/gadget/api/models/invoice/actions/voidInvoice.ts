import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const payments = await api.payment.findMany({ filter: { invoice: { id: { equals: record.id } } }, select: { id: true, amount: true }, first: 250 });
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  if (totalPaid > 0) {
    throw new Error('Cannot void an invoice with recorded payments ($' + totalPaid.toFixed(2) + ' paid). Reverse all payments first, then void the invoice.');
  }

  if (record.status === 'void') {
    throw new Error('This invoice is already voided.');
  }

  const fresh = await api.invoice.findOne(record.id, { select: { id: true, status: true, updatedAt: true } });

  if (fresh.status === 'void') {
    logger.info({ invoiceId: record.id, invoiceNumber: record.invoiceNumber }, "Invoice already voided by another process");
    return;
  }

  const freshPayments = await api.payment.findMany({ filter: { invoice: { id: { equals: record.id } } }, select: { id: true, amount: true }, first: 250 });
  const freshTotalPaid = freshPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  if (freshTotalPaid > 0) {
    throw new Error('Cannot void an invoice with recorded payments ($' + freshTotalPaid.toFixed(2) + ' paid). Reverse all payments first, then void the invoice.');
  }

  if (fresh.updatedAt.getTime() !== record.updatedAt.getTime()) {
    throw new Error('This invoice was modified by another user. Please refresh and try again.');
  }

  record.status = "void";
  await save(record);
  logger.info({ invoiceId: record.id, invoiceNumber: record.invoiceNumber }, "Invoice voided");
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api }) => {
  try {
    const business = await api.business.maybeFindFirst({ filter: { id: { equals: record.businessId as string } }, select: { id: true, name: true } });
    await api.activityLog.create({
      type: "invoice-voided",
      description: `Invoice ${record.invoiceNumber ?? record.id} voided`,
      ...(business ? { business: { _link: business.id } } : {}),
      invoice: { _link: record.id },
      ...(record.clientId ? { client: { _link: record.clientId as string } } : {}),
    });
  } catch (error) {
    logger.warn({ error, invoiceId: record.id }, "Failed to write activity log for invoice void");
  }
};

export const options: ActionOptions = {
  actionType: "custom",
};
