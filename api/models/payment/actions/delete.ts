import { deleteRecord, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: 'business' });

  if (record.invoiceId) {
    const invoice = await api.invoice.maybeFindOne(record.invoiceId, { select: { id: true, status: true } });

    if (invoice) {
      if (invoice.status === "paid") {
        throw new Error("Cannot delete a payment on a fully paid invoice. The financial record is locked — void the invoice to make corrections.");
      }

      if (invoice.status === "partial") {
        throw new Error("Cannot delete a payment on a partially paid invoice. The financial record is locked — void the invoice to make corrections.");
      }
    }
  }

  await deleteRecord(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api }) => {
  const invoiceId = record.invoiceId;
  if (!invoiceId) return;

  try {
    const invoice = await api.invoice.maybeFindOne(invoiceId, { select: { id: true, status: true } });
    if (!invoice) return;

    const remainingPayments = await api.payment.findMany({
      filter: { invoiceId: { equals: invoiceId } },
      select: { id: true, amount: true },
      first: 250,
    });

    const remainingPaid = remainingPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0);

    if (remainingPaid <= 0 && invoice.status !== "void" && invoice.status !== "draft" && invoice.status !== "sent") {
      await api.internal.invoice.update(invoiceId, { status: "draft", paidAt: null });
    }

    logger.info({ invoiceId, remainingPaid }, "Invoice status recalculated after payment deletion");
  } catch (err) {
    logger.warn({ err, invoiceId }, "Failed to recalculate invoice status after payment deletion");
  }
};

export const options: ActionOptions = {
  actionType: "delete",
};
