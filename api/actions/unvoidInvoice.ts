import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, api, session }) => {
  const id = params.id as string;
  const reason = params.reason as string | undefined;

  const userId = session!.get("user") as string;

  const invoice = await api.invoice.maybeFindOne(id, {
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      businessId: true,
      clientId: true,
      total: true,
      appointmentId: true,
    },
  });

  if (!invoice) {
    throw new Error("Invoice not found.");
  }

  if (invoice.status !== "void") {
    throw new Error(
      `Only voided invoices can be un-voided. This invoice has status: ${invoice.status}.`
    );
  }

  if (invoice.appointmentId) {
    const appointment = await api.appointment.maybeFindOne(invoice.appointmentId, {
      select: { id: true, status: true },
    });
    if (appointment && appointment.status === "cancelled") {
      throw new Error(
        "Cannot un-void this invoice: the associated appointment is cancelled. Create a new appointment and invoice instead."
      );
    }
  }

  // Verify ownership: find business where owner is the current user
  const business = await api.business.findFirst({
    filter: { ownerId: { equals: userId } },
    select: { id: true },
  });

  if (!business) {
    throw new Error("Not authorized to un-void this invoice.");
  }

  // Restore invoice to draft using internal API
  await api.internal.invoice.update(id, { status: "draft" });

  // Write activity log
  await api.activityLog.create({
    type: "invoice-unvoided",
    description: `Invoice un-voided: ${invoice.invoiceNumber}`,
    business: { _link: business.id },
    invoice: { _link: id },
    ...(invoice.clientId ? { client: { _link: invoice.clientId } } : {}),
    metadata: {
      performedBy: userId,
      reason: reason ?? null,
      previousStatus: "void",
      newStatus: "draft",
      restoredAt: new Date().toISOString(),
    },
  } as any);

  return { success: true, invoiceId: id, invoiceNumber: invoice.invoiceNumber };
};

export const params = {
  id: { type: "string" },
  reason: { type: "string" },
};

export const options: ActionOptions = {
  returnType: true,
  triggers: { api: true },
};
