import { applyParams, save, ActionOptions, assert } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record, { userBelongsToField: 'business' });

  const changes = record.changes();

  if ("invoiceId" in changes && changes["invoiceId"].current !== changes["invoiceId"].previous) {
    throw new Error("Cannot reassign a payment to a different invoice.");
  }

  const invoiceId = assert(record.invoiceId, "payment must have an associated invoice");
  const invoice = await api.invoice.findOne(invoiceId, { select: { id: true, status: true, total: true } });

  if (invoice.status === "paid") {
    throw new Error("Cannot modify a payment on a fully paid invoice. The financial record is locked.");
  }

  if (invoice.status === "void") {
    throw new Error("Cannot modify a payment on a voided invoice.");
  }

  if (invoice.status === "partial") {
    throw new Error("Cannot modify a payment on an invoice that has recorded payments. Use the Reverse Payment action to undo a payment instead.");
  }

  if ("amount" in changes && changes["amount"].current !== changes["amount"].previous) {
    if (record.amount == null || (record.amount as number) <= 0) {
      throw new Error("Payment amount must be greater than zero.");
    }

    if (!isFinite(record.amount as number)) {
      throw new Error("Payment amount must be a valid finite number.");
    }

    const otherPayments = await api.payment.findMany({
      filter: {
        invoiceId: { equals: invoiceId },
        id: { notEquals: record.id },
      },
      select: { id: true, amount: true },
      first: 250,
    });

    const otherPaymentsTotal = otherPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0);

    const EPSILON = 0.001;
    if (otherPaymentsTotal + (record.amount as number) > (invoice.total ?? 0) + EPSILON) {
      const remainingBalance = Math.max(0, (invoice.total ?? 0) - otherPaymentsTotal);
      throw new Error(
        "Updated payment amount would exceed the invoice total. Remaining balance is $" +
          remainingBalance.toFixed(2) +
          "."
      );
    }
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api }) => {
  try {
    const invoiceId = record.invoiceId as string;
    if (!invoiceId) return;

    const invoice = await api.invoice.findOne(invoiceId, {
      select: { id: true, total: true, status: true },
    });

    const payments = await api.payment.findMany({
      filter: { invoice: { id: { equals: invoiceId } } },
      select: { id: true, amount: true },
      first: 250,
    });

    const totalPaid = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const invoiceTotal = invoice.total ?? 0;

    if (totalPaid >= invoiceTotal) {
      await api.internal.invoice.update(invoiceId, { status: "paid", paidAt: new Date() });
      logger.info({ invoiceId, totalPaid, invoiceTotal }, "Invoice marked as paid after payment update");
    } else if (totalPaid > 0) {
      await api.internal.invoice.update(invoiceId, { status: "partial" });
      logger.info({ invoiceId, totalPaid, invoiceTotal }, "Invoice marked as partial after payment update");
    } else {
      if (invoice.status === "partial" || invoice.status === "paid") {
        await api.internal.invoice.update(invoiceId, { status: "sent" });
        logger.info({ invoiceId, revertStatus: "sent" }, "Invoice status reverted after payment update");
      }
    }
  } catch (err) {
    logger.warn({ err }, "Failed to recalculate invoice status after payment update; payment edit is still saved");
  }
};

export const options: ActionOptions = {
  actionType: "update",
};
