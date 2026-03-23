import { ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const payments = await api.payment.findMany({
    filter: { invoiceId: { equals: record.id } } as any,
    first: 1,
    select: { id: true },
  });
  if (payments.length > 0) {
    throw new Error(
      "Cannot delete invoice: it has recorded payments. Void the invoice instead to preserve payment history."
    );
  }

  if (record.status === "paid" || record.status === "partial") {
    throw new Error(
      "Cannot delete a paid or partially paid invoice. Void it instead to preserve the financial record."
    );
  }

  await api.internal.invoice.delete(record.id);
};

export const onSuccess: ActionOnSuccess = async ({ record, api, logger }) => {
  try {
    await api.activityLog.create({
      type: "invoice-deleted",
      description: `Invoice ${(record as any).invoiceNumber ?? record.id} deleted (was ${(record as any).status})`,
      business: { _link: (record as any).businessId },
      metadata: {
        invoiceNumber: (record as any).invoiceNumber,
        status: (record as any).status,
        total: (record as any).total,
      },
    } as any);
  } catch (err) {
    logger.warn({ err }, "Failed to create activity log for invoice deletion");
  }
};

export const options: ActionOptions = {
  actionType: "custom",
};
