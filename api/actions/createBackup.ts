import { createHash } from "crypto";
import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const businesses = await api.business.findMany({
    select: { id: true, name: true, ownerId: true },
    first: 250,
  });

  for (const business of businesses) {
    let snapshotId: string | undefined;
    try {
      const snapshot = await api.backupSnapshot.create({
        status: "running",
        label: "Daily Backup " + new Date().toISOString().slice(0, 10),
        business: { _link: business.ownerId },
      });
      snapshotId = snapshot.id;

      const [clients, vehicles, appointments, invoices, payments, services, staff, quotes, inventoryItems] =
        (await Promise.all([
          api.client.findMany({
            filter: { businessId: { equals: business.id } },
            first: 250,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              address: true,
              city: true,
              state: true,
              zip: true,
              deletedAt: true,
              createdAt: true,
            },
          }),
          api.vehicle.findMany({
            filter: { businessId: { equals: business.id } },
            first: 250,
            select: {
              id: true,
              clientId: true,
              make: true,
              model: true,
              year: true,
              vin: true,
              licensePlate: true,
              color: true,
              deletedAt: true,
              createdAt: true,
            },
          }),
          api.appointment.findMany({
            filter: { businessId: { equals: business.id } },
            first: 250,
            select: {
              id: true,
              clientId: true,
              vehicleId: true,
              assignedStaffId: true,
              status: true,
              startTime: true,
              endTime: true,
              totalPrice: true,
              createdAt: true,
            },
          }),
          api.invoice.findMany({
            filter: { businessId: { equals: business.id } },
            first: 250,
            select: {
              id: true,
              clientId: true,
              invoiceNumber: true,
              status: true,
              subtotal: true,
              taxAmount: true,
              total: true,
              paidAt: true,
              createdAt: true,
            },
          }),
          api.payment.findMany({
            filter: { businessId: { equals: business.id } },
            first: 250,
            select: {
              id: true,
              invoiceId: true,
              amount: true,
              method: true,
              paidAt: true,
              createdAt: true,
            },
          }),
          api.service.findMany({
            filter: { businessId: { equals: business.id } },
            first: 250,
            select: {
              id: true,
              name: true,
              category: true,
              price: true,
              active: true,
              deletedAt: true,
              createdAt: true,
            },
          }),
          api.staff.findMany({
            filter: { businessId: { equals: business.id } },
            first: 250,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              active: true,
              deletedAt: true,
              createdAt: true,
            },
          }),
          api.quote.findMany({
            filter: { businessId: { equals: business.id } },
            first: 250,
            select: {
              id: true,
              clientId: true,
              vehicleId: true,
              status: true,
              total: true,
              createdAt: true,
            },
          }),
          api.inventoryItem.findMany({
            filter: { businessId: { equals: business.id } },
            first: 250,
            select: {
              id: true,
              name: true,
              sku: true,
              quantity: true,
              costPerUnit: true,
              createdAt: true,
            },
          }),
        ])) as [
          Awaited<ReturnType<typeof api.client.findMany>>,
          Awaited<ReturnType<typeof api.vehicle.findMany>>,
          Awaited<ReturnType<typeof api.appointment.findMany>>,
          Awaited<ReturnType<typeof api.invoice.findMany>>,
          Awaited<ReturnType<typeof api.payment.findMany>>,
          Awaited<ReturnType<typeof api.service.findMany>>,
          Awaited<ReturnType<typeof api.staff.findMany>>,
          Awaited<ReturnType<typeof api.quote.findMany>>,
          Awaited<ReturnType<typeof api.inventoryItem.findMany>>,
        ];

      const truncatedModels: string[] = [];
      if (clients.hasNextPage) {
        logger.warn({ businessId: business.id, model: "clients" }, "createBackup: client records truncated at 250 — backup is incomplete");
        truncatedModels.push("clients");
      }
      if (vehicles.hasNextPage) {
        logger.warn({ businessId: business.id, model: "vehicles" }, "createBackup: vehicle records truncated at 250 — backup is incomplete");
        truncatedModels.push("vehicles");
      }
      if (appointments.hasNextPage) {
        logger.warn({ businessId: business.id, model: "appointments" }, "createBackup: appointment records truncated at 250 — backup is incomplete");
        truncatedModels.push("appointments");
      }
      if (invoices.hasNextPage) {
        logger.warn({ businessId: business.id, model: "invoices" }, "createBackup: invoice records truncated at 250 — backup is incomplete");
        truncatedModels.push("invoices");
      }
      if (payments.hasNextPage) {
        logger.warn({ businessId: business.id, model: "payments" }, "createBackup: payment records truncated at 250 — backup is incomplete");
        truncatedModels.push("payments");
      }
      if (services.hasNextPage) {
        logger.warn({ businessId: business.id, model: "services" }, "createBackup: service records truncated at 250 — backup is incomplete");
        truncatedModels.push("services");
      }
      if (staff.hasNextPage) {
        logger.warn({ businessId: business.id, model: "staff" }, "createBackup: staff records truncated at 250 — backup is incomplete");
        truncatedModels.push("staff");
      }
      if (quotes.hasNextPage) {
        logger.warn({ businessId: business.id, model: "quotes" }, "createBackup: quote records truncated at 250 — backup is incomplete");
        truncatedModels.push("quotes");
      }
      if (inventoryItems.hasNextPage) {
        logger.warn({ businessId: business.id, model: "inventoryItems" }, "createBackup: inventoryItem records truncated at 250 — backup is incomplete");
        truncatedModels.push("inventoryItems");
      }

      const data = {
        exportedAt: new Date().toISOString(),
        businessId: business.id,
        clients,
        vehicles,
        appointments,
        invoices,
        payments,
        services,
        staff,
        quotes,
        inventoryItems,
      };

      const recordCounts = {
        clients: clients.length,
        vehicles: vehicles.length,
        appointments: appointments.length,
        invoices: invoices.length,
        payments: payments.length,
        services: services.length,
        staff: staff.length,
        quotes: quotes.length,
        inventoryItems: inventoryItems.length,
        total:
          clients.length +
          vehicles.length +
          appointments.length +
          invoices.length +
          payments.length +
          services.length +
          staff.length +
          quotes.length +
          inventoryItems.length,
        truncatedModels,
      };

      const checksum = createHash("sha256").update(JSON.stringify(data)).digest("hex");

      await api.backupSnapshot.update(snapshotId, {
        status: "complete",
        data,
        recordCounts,
        checksum,
        completedAt: new Date(),
      } as any);
    } catch (error: any) {
      if (snapshotId) {
        await api.backupSnapshot.update(snapshotId, {
          status: "failed",
          errorMessage: error.message,
        } as any);
      }
      logger.warn({ error, businessId: business.id }, "Failed to backup business");
    }
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const oldSnapshots = await api.backupSnapshot.findMany({
    filter: { completedAt: { lessThan: cutoff } },
    first: 250,
  });
  for (const snapshot of oldSnapshots) {
    await api.backupSnapshot.delete(snapshot.id);
  }

  logger.info({ businessCount: businesses.length }, "Daily backup complete");
};

export const options: ActionOptions = {
  triggers: {
    scheduler: [{ cron: "0 2 * * *" }],
    api: true,
  },
};