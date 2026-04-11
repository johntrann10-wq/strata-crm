import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/index.js";
import { activityLogs, appointments, invoices, payments } from "../src/db/schema.js";
import { calculateAppointmentFinanceSummary, getAppointmentFinanceMirrorUpdates } from "../src/lib/appointmentFinance.js";

type AppointmentRepairRow = {
  id: string;
  businessId: string;
  title: string | null;
  depositAmount: string | number | null;
  totalPrice: string | number | null;
  paidAt: Date | null;
  updatedAt?: Date | null;
  depositPaid?: boolean | null;
};

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadAppointmentRows() {
  const columns = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_name = 'appointments'
  `);
  const columnNames = Array.isArray(columns.rows)
    ? columns.rows.map((row) => String((row as { column_name?: unknown }).column_name ?? ""))
    : [];
  const hasDepositPaid = columnNames.includes("deposit_paid");
  const hasUpdatedAt = columnNames.includes("updated_at");

  const rows = hasDepositPaid
    ? await db
        .select({
          id: appointments.id,
          businessId: appointments.businessId,
          title: appointments.title,
          depositAmount: appointments.depositAmount,
          totalPrice: appointments.totalPrice,
          paidAt: appointments.paidAt,
          updatedAt: hasUpdatedAt ? appointments.updatedAt : sql<Date | null>`null`,
          depositPaid: appointments.depositPaid,
        })
        .from(appointments)
    : await db
        .select({
          id: appointments.id,
          businessId: appointments.businessId,
          title: appointments.title,
          depositAmount: appointments.depositAmount,
          totalPrice: appointments.totalPrice,
          paidAt: appointments.paidAt,
          updatedAt: hasUpdatedAt ? appointments.updatedAt : sql<Date | null>`null`,
        })
        .from(appointments);

  return {
    rows: rows as AppointmentRepairRow[],
    hasDepositPaid,
    hasUpdatedAt,
  };
}

async function getDirectCollectedAmount(appointmentId: string) {
  const [directPaymentSum] = await db
    .select({
      total: sql<string>`coalesce(sum(
        case
          when ${activityLogs.action} = 'appointment.deposit_paid' then coalesce((${activityLogs.metadata}->>'amount')::numeric, 0)
          when ${activityLogs.action} = 'appointment.deposit_payment_reversed' then -coalesce((${activityLogs.metadata}->>'amount')::numeric, 0)
          else 0
        end
      ), 0)`,
    })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.entityType, "appointment"),
        eq(activityLogs.entityId, appointmentId),
        sql`${activityLogs.action} in ('appointment.deposit_paid', 'appointment.deposit_payment_reversed')`
      )
    );

  return Number(directPaymentSum?.total ?? 0);
}

async function getInvoiceCollectedAmount(appointmentId: string, businessId: string) {
  const linkedInvoices = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.appointmentId, appointmentId), eq(invoices.businessId, businessId)));

  const invoiceIds = linkedInvoices.map((invoice) => invoice.id);
  if (invoiceIds.length === 0) return 0;

  const [invoicePaymentSum] = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${payments.reversedAt} is null then ${payments.amount} else 0 end), 0)`,
    })
    .from(payments)
    .where(sql`${payments.invoiceId} in ${sql.join(invoiceIds.map((id) => sql`${id}`), sql`, `)}`);

  return Number(invoicePaymentSum?.total ?? 0);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { rows, hasDepositPaid, hasUpdatedAt } = await loadAppointmentRows();
  const proposedChanges: Array<Record<string, unknown>> = [];
  let appliedCount = 0;

  for (const appointment of rows) {
    const directCollectedAmount = await getDirectCollectedAmount(appointment.id);
    const invoiceCollectedAmount = await getInvoiceCollectedAmount(appointment.id, appointment.businessId);
    const finance = calculateAppointmentFinanceSummary({
      id: appointment.id,
      depositAmount: appointment.depositAmount,
      totalPrice: appointment.totalPrice,
      directCollectedAmount,
      invoiceCollectedAmount,
      invoiceCarryoverAmount: 0,
      paidAt: appointment.paidAt,
    });

    const desiredUpdates = getAppointmentFinanceMirrorUpdates({
      depositAmount: appointment.depositAmount,
      finance,
      paidAtWhenPaid: appointment.paidAt ?? new Date(),
      includeUpdatedAt: hasUpdatedAt,
    });

    const nextPaidAt = ("paidAt" in desiredUpdates ? desiredUpdates.paidAt : appointment.paidAt) ?? null;
    const nextDepositPaid = hasDepositPaid ? ("depositPaid" in desiredUpdates ? desiredUpdates.depositPaid === true : false) : null;
    const currentDepositPaid = appointment.depositPaid === true;
    const currentPaidAtIso = appointment.paidAt ? new Date(appointment.paidAt).toISOString() : null;
    const nextPaidAtIso = nextPaidAt instanceof Date ? nextPaidAt.toISOString() : nextPaidAt ? new Date(nextPaidAt).toISOString() : null;

    const needsDepositMirrorRepair = hasDepositPaid && currentDepositPaid !== nextDepositPaid;
    const needsPaidAtRepair = currentPaidAtIso !== nextPaidAtIso;

    if (!needsDepositMirrorRepair && !needsPaidAtRepair) {
      continue;
    }

    const change = {
      appointmentId: appointment.id,
      title: appointment.title,
      current: {
        depositPaid: hasDepositPaid ? currentDepositPaid : null,
        paidAt: currentPaidAtIso,
      },
      next: {
        depositPaid: hasDepositPaid ? nextDepositPaid : null,
        paidAt: nextPaidAtIso,
      },
      computed: {
        collectedAmount: finance.collectedAmount,
        balanceDue: finance.balanceDue,
        paidInFull: finance.paidInFull,
        depositSatisfied: finance.depositSatisfied,
      },
    };

    proposedChanges.push(change);

    if (!apply) {
      continue;
    }

    const updatePayload: Record<string, unknown> = {};
    if (hasDepositPaid) {
      updatePayload.depositPaid = nextDepositPaid;
    }
    updatePayload.paidAt = nextPaidAt;
    if (hasUpdatedAt) {
      updatePayload.updatedAt = new Date();
    }

    await db
      .update(appointments)
      .set(updatePayload)
      .where(eq(appointments.id, appointment.id));
    appliedCount += 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        checkedAppointments: rows.length,
        proposedChangeCount: proposedChanges.length,
        appliedCount,
        proposedChanges,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
