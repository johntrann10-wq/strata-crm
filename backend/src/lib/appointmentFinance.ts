import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { activityLogs, invoices, payments } from "../db/schema.js";

type DbExecutor = any;

export type AppointmentFinanceInput = {
  id: string;
  totalPrice?: number | string | null;
  depositAmount?: number | string | null;
  paidAt?: Date | string | null;
};

export type AppointmentFinanceSummary = {
  collectedAmount: number;
  balanceDue: number;
  paidInFull: boolean;
  depositSatisfied: boolean;
  hasAnyPayment: boolean;
  directCollectedAmount: number;
  invoiceCollectedAmount: number;
  invoiceCarryoverAmount: number;
};

function toMoneyNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const normalized = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(normalized) ? normalized : 0;
}

export function hasValidPaidAtValue(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function isCarryoverPaymentRow(row: { notes?: string | null; idempotencyKey?: string | null }) {
  return (
    String(row.notes ?? "").trim() === "Carried over from appointment payment state." ||
    String(row.idempotencyKey ?? "").startsWith("appointment-payment-carryover:")
  );
}

export function calculateAppointmentFinanceSummary(input: AppointmentFinanceInput & {
  directCollectedAmount?: number;
  invoiceCollectedAmount?: number;
  invoiceCarryoverAmount?: number;
}): AppointmentFinanceSummary {
  const totalPrice = Math.max(0, toMoneyNumber(input.totalPrice));
  const depositAmount = Math.max(0, toMoneyNumber(input.depositAmount));
  const directCollectedAmount = Math.max(0, toMoneyNumber(input.directCollectedAmount));
  const invoiceCollectedAmount = Math.max(0, toMoneyNumber(input.invoiceCollectedAmount));
  const invoiceCarryoverAmount = Math.max(0, toMoneyNumber(input.invoiceCarryoverAmount));

  let collectedAmount = invoiceCollectedAmount + Math.max(0, directCollectedAmount - invoiceCarryoverAmount);
  if (invoiceCollectedAmount <= 0.009) {
    collectedAmount = directCollectedAmount;
  }
  if (hasValidPaidAtValue(input.paidAt) && totalPrice > 0) {
    collectedAmount = Math.max(collectedAmount, totalPrice);
  }
  if (totalPrice > 0) {
    collectedAmount = Math.min(totalPrice, collectedAmount);
  }
  collectedAmount = Math.max(0, Number(collectedAmount.toFixed(2)));

  const balanceDue = totalPrice > 0 ? Math.max(0, Number((totalPrice - collectedAmount).toFixed(2))) : 0;
  const paidInFull = totalPrice > 0 ? balanceDue <= 0.009 && (collectedAmount > 0.009 || hasValidPaidAtValue(input.paidAt)) : hasValidPaidAtValue(input.paidAt);
  const requiredDepositAmount =
    depositAmount > 0 ? Math.min(totalPrice > 0 ? totalPrice : depositAmount, depositAmount) : 0;
  const depositSatisfied = requiredDepositAmount > 0 ? collectedAmount >= requiredDepositAmount - 0.009 : false;
  const hasAnyPayment = collectedAmount > 0.009 || paidInFull;

  return {
    collectedAmount,
    balanceDue,
    paidInFull,
    depositSatisfied,
    hasAnyPayment,
    directCollectedAmount: Math.max(0, Number(directCollectedAmount.toFixed(2))),
    invoiceCollectedAmount: Math.max(0, Number(invoiceCollectedAmount.toFixed(2))),
    invoiceCarryoverAmount: Math.max(0, Number(invoiceCarryoverAmount.toFixed(2))),
  };
}

export async function getAppointmentFinanceSummaryMap(
  businessId: string,
  appointmentsInput: AppointmentFinanceInput[],
  tx: DbExecutor = db
): Promise<Map<string, AppointmentFinanceSummary>> {
  const appointmentIds = Array.from(new Set(appointmentsInput.map((appointment) => appointment.id).filter(Boolean)));
  const summaries = new Map<string, AppointmentFinanceSummary>();
  if (appointmentIds.length === 0) return summaries;

  const paymentLogRows = await tx
    .select({
      entityId: activityLogs.entityId,
      action: activityLogs.action,
      metadata: activityLogs.metadata,
    })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.businessId, businessId),
        eq(activityLogs.entityType, "appointment"),
        inArray(activityLogs.entityId, appointmentIds),
        sql`${activityLogs.action} in ('appointment.deposit_paid', 'appointment.deposit_payment_reversed')`
      )
    )
    .orderBy(asc(activityLogs.createdAt));

  const directCollectedByAppointment = new Map<string, number>();
  for (const row of paymentLogRows as Array<{ entityId: string; action: string; metadata?: string | null }>) {
    let amount = 0;
    try {
      const parsed = row.metadata ? (JSON.parse(row.metadata) as { amount?: number | string | null }) : null;
      amount = Number(parsed?.amount ?? 0);
    } catch {
      amount = 0;
    }
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const current = directCollectedByAppointment.get(row.entityId) ?? 0;
    directCollectedByAppointment.set(
      row.entityId,
      row.action === "appointment.deposit_payment_reversed" ? current - amount : current + amount
    );
  }

  const invoicePaymentRows = await tx
    .select({
      appointmentId: invoices.appointmentId,
      amount: payments.amount,
      notes: payments.notes,
      idempotencyKey: payments.idempotencyKey,
    })
    .from(invoices)
    .leftJoin(
      payments,
      and(
        eq(payments.invoiceId, invoices.id),
        sql`${payments.reversedAt} is null`
      )
    )
    .where(
      and(
        eq(invoices.businessId, businessId),
        inArray(invoices.appointmentId, appointmentIds),
        sql`${invoices.status} <> 'void'`
      )
    );

  const invoiceCollectedByAppointment = new Map<string, number>();
  const invoiceCarryoverByAppointment = new Map<string, number>();
  for (const row of invoicePaymentRows as Array<{
    appointmentId: string | null;
    amount?: string | number | null;
    notes?: string | null;
    idempotencyKey?: string | null;
  }>) {
    if (!row.appointmentId) continue;
    const amount = toMoneyNumber(row.amount);
    if (amount <= 0) continue;
    invoiceCollectedByAppointment.set(row.appointmentId, (invoiceCollectedByAppointment.get(row.appointmentId) ?? 0) + amount);
    if (isCarryoverPaymentRow(row)) {
      invoiceCarryoverByAppointment.set(row.appointmentId, (invoiceCarryoverByAppointment.get(row.appointmentId) ?? 0) + amount);
    }
  }

  for (const appointment of appointmentsInput) {
    summaries.set(
      appointment.id,
      calculateAppointmentFinanceSummary({
        ...appointment,
        directCollectedAmount: directCollectedByAppointment.get(appointment.id) ?? 0,
        invoiceCollectedAmount: invoiceCollectedByAppointment.get(appointment.id) ?? 0,
        invoiceCarryoverAmount: invoiceCarryoverByAppointment.get(appointment.id) ?? 0,
      })
    );
  }

  return summaries;
}
