import { deleteRecord, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  // Idempotency check: if already reversed, skip to prevent double-reversals
  if (record.reversedAt) {
    logger.info({ paymentId: record.id }, "Payment already reversed (idempotent), skipping");
    return;
  }

  if (!record.invoiceId) {
    throw new Error("Cannot reverse a payment with no associated invoice.");
  }

  const invoice = await api.invoice.maybeFindOne(record.invoiceId as string, {
    select: { id: true, status: true, total: true, invoiceNumber: true },
  });

  if (!invoice) {
    throw new Error("Cannot reverse a payment with no associated invoice.");
  }

  if (invoice.status === "void") {
    throw new Error("Cannot reverse a payment on a voided invoice.");
  }

  // Stamp reversedAt before deleting so concurrent retries see it and exit early
  record.reversedAt = new Date();
  await save(record);

  await deleteRecord(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api }) => {
  if (!record.invoiceId) return;

  const remainingPayments = await api.payment.findMany({
    filter: { invoiceId: { equals: record.invoiceId as string } },
    select: { id: true, amount: true },
    first: 250,
  });

  const remainingPaid = remainingPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0);

  const invoice = await api.invoice.findOne(record.invoiceId as string, {
    select: { id: true, total: true, status: true },
  });

  const invoiceTotal = invoice.total ?? 0;
  let newStatus: string | undefined;

  if (remainingPaid <= 0) {
    if (invoice.status === "paid" || invoice.status === "partial") {
      newStatus = "draft";
    }
  } else if (remainingPaid > 0 && remainingPaid < invoiceTotal) {
    newStatus = "partial";
  }
  // If remainingPaid >= invoiceTotal, status stays paid — guard against it

  if (newStatus !== undefined) {
    if (newStatus === "draft") {
      await api.internal.invoice.update(record.invoiceId as string, { status: "draft", paidAt: null });
    } else {
      await api.internal.invoice.update(record.invoiceId as string, { status: newStatus });
    }
  }

  logger.info(
    {
      paymentId: record.id,
      invoiceId: record.invoiceId,
      amountReversed: record.amount,
      newStatus: newStatus ?? invoice.status,
    },
    "Payment reversed"
  );

  try {
    const business = await api.business.maybeFindFirst({
      filter: { owner: { id: { equals: record.businessId as string } } },
      select: { id: true },
    });

    if (business) {
      await api.activityLog.create({
        type: "payment-reversed",
        description: `Payment of $${((record.amount as number) ?? 0).toFixed(2)} reversed`,
        business: { _link: business.id },
        invoice: { _link: record.invoiceId as string },
        metadata: {
          paymentId: record.id,
          amountReversed: record.amount,
          method: record.method,
          invoiceId: record.invoiceId,
          newInvoiceStatus: newStatus ?? invoice.status,
        },
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to create activity log for payment reversal");
  }
};

export const options: ActionOptions = {
  actionType: "delete",
};
