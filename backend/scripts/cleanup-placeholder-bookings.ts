import "dotenv/config";

import { inArray, sql } from "drizzle-orm";

import { closeDb, db } from "../src/db/index.js";
import { appointments, clients, invoices, quotes, vehicles } from "../src/db/schema.js";

const APPLY = process.argv.includes("--apply");

const PLACEHOLDER_CLIENT_NOTES = "Auto-created while booking an appointment without a selected client.";
const PLACEHOLDER_CLIENT_INTERNAL_NOTES = "System-generated booking placeholder.";
const PLACEHOLDER_VEHICLE_NOTES = "Auto-created while booking an appointment without a selected vehicle.";

type IdRow = { id: string };

async function main() {
  const placeholderClients = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      sql`${clients.firstName} = 'Walk-in'
        and ${clients.lastName} = 'Customer'
        and ${clients.notes} = ${PLACEHOLDER_CLIENT_NOTES}
        and ${clients.internalNotes} = ${PLACEHOLDER_CLIENT_INTERNAL_NOTES}`
    );

  const placeholderVehicles = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(
      sql`${vehicles.make} = 'Unspecified'
        and ${vehicles.model} = 'Vehicle'
        and ${vehicles.displayName} = 'Unspecified Vehicle'
        and ${vehicles.notes} = ${PLACEHOLDER_VEHICLE_NOTES}`
    );

  const placeholderClientIds = placeholderClients.map((row) => row.id);
  const placeholderVehicleIds = placeholderVehicles.map((row) => row.id);

  const appointmentClientRefs = placeholderClientIds.length
    ? await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(inArray(appointments.clientId, placeholderClientIds))
    : [];
  const appointmentVehicleRefs = placeholderVehicleIds.length
    ? await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(inArray(appointments.vehicleId, placeholderVehicleIds))
    : [];

  const quoteClientRefs = placeholderClientIds.length
    ? await db.select({ id: quotes.clientId }).from(quotes).where(inArray(quotes.clientId, placeholderClientIds))
    : [];
  const invoiceClientRefs = placeholderClientIds.length
    ? await db
        .select({ id: invoices.clientId })
        .from(invoices)
        .where(inArray(invoices.clientId, placeholderClientIds))
    : [];
  const quoteVehicleRefs = placeholderVehicleIds.length
    ? await db
        .select({ id: quotes.vehicleId })
        .from(quotes)
        .where(inArray(quotes.vehicleId, placeholderVehicleIds))
    : [];

  const protectedClientIds = new Set(
    [...quoteClientRefs, ...invoiceClientRefs].map((row) => row.id).filter((value): value is string => Boolean(value))
  );
  const protectedVehicleIds = new Set(
    quoteVehicleRefs.map((row) => row.id).filter((value): value is string => Boolean(value))
  );

  const summary = {
    placeholderClients: placeholderClientIds.length,
    placeholderVehicles: placeholderVehicleIds.length,
    appointmentsUsingPlaceholderClients: appointmentClientRefs.length,
    appointmentsUsingPlaceholderVehicles: appointmentVehicleRefs.length,
    protectedClientsWithQuotesOrInvoices: protectedClientIds.size,
    protectedVehiclesWithQuotes: protectedVehicleIds.size,
  };

  console.log("[cleanup-placeholder-bookings] Summary");
  console.table(summary);

  if (!APPLY) {
    console.log("[cleanup-placeholder-bookings] Dry run only. Re-run with --apply to make changes.");
    return;
  }

  const result = await db.transaction(async (tx) => {
    let detachedAppointmentClients = 0;
    let detachedAppointmentVehicles = 0;
    let deletedVehicles = 0;
    let deletedClients = 0;

    if (placeholderClientIds.length) {
      const detached = await tx
        .update(appointments)
        .set({ clientId: null, updatedAt: new Date() })
        .where(inArray(appointments.clientId, placeholderClientIds))
        .returning({ id: appointments.id });
      detachedAppointmentClients = detached.length;
    }

    if (placeholderVehicleIds.length) {
      const detached = await tx
        .update(appointments)
        .set({ vehicleId: null, updatedAt: new Date() })
        .where(inArray(appointments.vehicleId, placeholderVehicleIds))
        .returning({ id: appointments.id });
      detachedAppointmentVehicles = detached.length;
    }

    const deletableVehicles = placeholderVehicleIds.filter((id) => !protectedVehicleIds.has(id));
    if (deletableVehicles.length) {
      const deleted = await tx
        .delete(vehicles)
        .where(
          sql`${vehicles.id} = any(${deletableVehicles}::uuid[])
            and not exists (
              select 1 from quotes q
              where q.vehicle_id = ${vehicles.id}
            )`
        )
        .returning({ id: vehicles.id });
      deletedVehicles = deleted.length;
    }

    const deletableClients = placeholderClientIds.filter((id) => !protectedClientIds.has(id));
    if (deletableClients.length) {
      const deleted = await tx
        .delete(clients)
        .where(
          sql`${clients.id} = any(${deletableClients}::uuid[])
            and not exists (
              select 1 from vehicles v
              where v.client_id = ${clients.id}
            )
            and not exists (
              select 1 from quotes q
              where q.client_id = ${clients.id}
            )
            and not exists (
              select 1 from invoices i
              where i.client_id = ${clients.id}
            )
            and not exists (
              select 1 from appointments a
              where a.client_id = ${clients.id}
            )`
        )
        .returning({ id: clients.id });
      deletedClients = deleted.length;
    }

    return {
      detachedAppointmentClients,
      detachedAppointmentVehicles,
      deletedVehicles,
      deletedClients,
    };
  });

  console.log("[cleanup-placeholder-bookings] Applied");
  console.table(result);
}

main()
  .catch((error) => {
    console.error("[cleanup-placeholder-bookings] Failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
