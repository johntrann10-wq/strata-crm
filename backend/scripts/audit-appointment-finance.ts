import "dotenv/config";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/index.js";
import { activityLogs, appointments, invoices, payments } from "../src/db/schema.js";
import { calculateAppointmentFinanceSummary } from "../src/lib/appointmentFinance.js";

type AppointmentAuditRow = {
  id: string;
  businessId: string;
  title: string | null;
  clientId: string | null;
  depositAmount: string | number | null;
  totalPrice: string | number | null;
  paidAt: Date | null;
  depositPaid?: boolean | null;
};

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main() {
  const columns = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_name = 'appointments'
  `);
  const hasDepositPaid = Array.isArray(columns.rows)
    ? columns.rows.some((row) => String((row as { column_name?: unknown }).column_name ?? "") === "deposit_paid")
    : false;

  const appointmentRows = hasDepositPaid
    ? await db
        .select({
          id: appointments.id,
          businessId: appointments.businessId,
          title: appointments.title,
          clientId: appointments.clientId,
          depositAmount: appointments.depositAmount,
          totalPrice: appointments.totalPrice,
          paidAt: appointments.paidAt,
          depositPaid: appointments.depositPaid,
        })
        .from(appointments)
    : await db
        .select({
          id: appointments.id,
          businessId: appointments.businessId,
          title: appointments.title,
          clientId: appointments.clientId,
          depositAmount: appointments.depositAmount,
          totalPrice: appointments.totalPrice,
          paidAt: appointments.paidAt,
        })
        .from(appointments);

  const suspicious: Array<Record<string, unknown>> = [];

  for (const appointment of appointmentRows as AppointmentAuditRow[]) {
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
          eq(activityLogs.entityId, appointment.id),
          sql`${activityLogs.action} in ('appointment.deposit_paid', 'appointment.deposit_payment_reversed')`
        )
      );

    const linkedInvoices = await db
      .select({
        id: invoices.id,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(eq(invoices.appointmentId, appointment.id), eq(invoices.businessId, appointment.businessId)));

    const invoiceIds = linkedInvoices.map((invoice) => invoice.id);
    const invoiceCollectedAmount = invoiceIds.length
      ? Number(
          (
            await db
              .select({
                total: sql<string>`coalesce(sum(case when ${payments.reversedAt} is null then ${payments.amount} else 0 end), 0)`,
              })
              .from(payments)
              .where(sql`${payments.invoiceId} in ${sql.join(invoiceIds.map((id) => sql`${id}`), sql`, `)}`)
          )[0]?.total ?? 0
        )
      : 0;

    const directCollectedAmount = Number(directPaymentSum?.total ?? 0);
    const finance = calculateAppointmentFinanceSummary({
      id: appointment.id,
      depositAmount: appointment.depositAmount,
      totalPrice: appointment.totalPrice,
      directCollectedAmount,
      invoiceCollectedAmount,
      invoiceCarryoverAmount: 0,
      paidAt: appointment.paidAt,
    });

    const depositAmount = money(appointment.depositAmount);
    const totalPrice = money(appointment.totalPrice);
    const legacyDepositPaid = appointment.depositPaid === true;

    if (depositAmount <= 0 && legacyDepositPaid) {
      suspicious.push({
        appointmentId: appointment.id,
        issue: "no-deposit appointment still has legacy deposit_paid = true",
        depositAmount,
        totalPrice,
      });
    }

    if (legacyDepositPaid && finance.depositSatisfied !== true) {
      suspicious.push({
        appointmentId: appointment.id,
        issue: "legacy deposit_paid says true but computed depositSatisfied is false",
        depositAmount,
        totalPrice,
        collectedAmount: finance.collectedAmount,
        balanceDue: finance.balanceDue,
      });
    }

    if (finance.paidInFull && finance.balanceDue > 0.009) {
      suspicious.push({
        appointmentId: appointment.id,
        issue: "appointment is marked paid in full but still has a remaining balance",
        totalPrice,
        collectedAmount: finance.collectedAmount,
        balanceDue: finance.balanceDue,
      });
    }

    if (!finance.paidInFull && finance.balanceDue <= 0.009 && totalPrice > 0 && finance.collectedAmount > 0.009) {
      suspicious.push({
        appointmentId: appointment.id,
        issue: "appointment shows zero balance but is not marked paid in full",
        totalPrice,
        collectedAmount: finance.collectedAmount,
      });
    }

    if (finance.collectedAmount > totalPrice + 0.009 && totalPrice > 0) {
      suspicious.push({
        appointmentId: appointment.id,
        issue: "collected amount exceeds appointment total",
        totalPrice,
        collectedAmount: finance.collectedAmount,
      });
    }
  }

  console.log(JSON.stringify({
    checkedAppointments: appointmentRows.length,
    suspiciousCount: suspicious.length,
    suspicious,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
