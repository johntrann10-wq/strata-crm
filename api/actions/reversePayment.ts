import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  // 1. Get current session userId
  const userId = session?.get("user") as string | undefined;
  if (!userId) throw new Error("Not authenticated.");

  const id = params.id as string | undefined;
  if (!id) throw new Error("Payment ID is required.");
  const reason = params.reason as string | undefined;

  // 2. Find the payment by id
  const payment = await api.payment.findOne(id, {
    select: { id: true, amount: true, method: true, invoiceId: true, businessId: true, createdAt: true },
  });

  // 3. If not found, throw
  if (!payment) throw new Error("Payment not found.");

  // 4. Verify ownership: payment.business → user model, so businessId is the owner's userId
  if (payment.businessId !== userId) throw new Error("Permission denied.");

  // Find the business record (business model) for activity log
  const businessRecord = await api.business.findFirst({
    filter: { ownerId: { equals: userId } },
    select: { id: true },
  });
  if (!businessRecord) throw new Error("Business not found.");

  // 5. Find the parent invoice
  if (!payment.invoiceId) throw new Error("Payment has no associated invoice.");
  const invoice = await api.invoice.findOne(payment.invoiceId, {
    select: { id: true, invoiceNumber: true, status: true, total: true },
  });

  // 6. Check if invoice is voided
  if (invoice.status === "void") throw new Error("Cannot reverse a payment on a voided invoice.");

  // 7. Store details for logging
  const paymentAmount = payment.amount ?? 0;
  const invoiceId = payment.invoiceId;
  const paymentMethod = payment.method;
  const previousInvoiceStatus = invoice.status;
  const invoiceTotal = invoice.total ?? 0;
  const invoiceNumber = invoice.invoiceNumber ?? "";

  // 8. Delete the payment using internal api
  await api.internal.payment.delete(id);

  // 9. Fetch remaining payments fresh after deletion to compute new invoice status
  const remainingPayments = await api.payment.findMany({
    filter: { invoiceId: { equals: invoiceId } },
    select: { id: true, amount: true },
    first: 250,
  });
  const sumAfterRemoval = remainingPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0);

  let newStatus: string;
  if (invoiceTotal > 0 && sumAfterRemoval >= invoiceTotal) {
    newStatus = "paid";
  } else if (sumAfterRemoval > 0) {
    newStatus = "partial";
  } else {
    if (["sent", "paid", "partial"].includes(previousInvoiceStatus ?? "")) {
      newStatus = "sent";
    } else {
      newStatus = "draft";
    }
  }

  // 10. Write activity log after successful payment delete
  await api.activityLog.create({
    type: "payment-reversed",
    description: `Payment of $${paymentAmount.toFixed(2)} reversed on invoice ${invoiceNumber}`,
    business: { _link: businessRecord.id },
    invoice: { _link: invoiceId },
    metadata: {
      performedBy: userId,
      reason: reason ?? null,
      paymentId: id,
      amount: paymentAmount,
      method: paymentMethod,
      previousInvoiceStatus,
      newInvoiceStatus: newStatus,
    },
  } as any);

  // 11. Update invoice via internal api, clearing paidAt if no longer fully paid
  const invoiceUpdateData: Record<string, unknown> = { status: newStatus };
  if (newStatus !== "paid") {
    invoiceUpdateData.paidAt = null;
  }
  await api.internal.invoice.update(invoiceId, invoiceUpdateData);

  // 12. Return result
  return { success: true, paymentId: id, invoiceId, newInvoiceStatus: newStatus };
};

export const params = {
  id: { type: "string" },
  reason: { type: "string" },
};

export const options: ActionOptions = {
  returnType: true,
  triggers: { api: true },
};
