import { ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  // Validate: promo code must be active
  if (!record.active) {
    throw new Error("This promo code is not active.");
  }

  // Validate: promo code must not be expired
  if (record.expiresAt !== null && record.expiresAt !== undefined && new Date(record.expiresAt as unknown as string) < new Date()) {
    throw new Error("This promo code has expired.");
  }

  // Validate: promo code must not have exceeded max uses
  if (
    record.maxUses !== null &&
    record.maxUses !== undefined &&
    (record.timesUsed ?? 0) >= (record.maxUses as number)
  ) {
    throw new Error("This promo code has reached its maximum number of uses.");
  }

  const invoiceTotal = params.invoiceTotal as number;
  if (typeof invoiceTotal !== "number" || isNaN(invoiceTotal) || invoiceTotal < 0) {
    throw new Error("Invoice total must be a non-negative number.");
  }

  // Validate: invoice total must meet minimum job value if set
  if (
    record.minimumJobValue !== null &&
    record.minimumJobValue !== undefined &&
    invoiceTotal < (record.minimumJobValue as number)
  ) {
    throw new Error(
      `This promo code requires a minimum invoice total of $${(record.minimumJobValue as number).toFixed(2)}.`
    );
  }

  // Calculate discount
  let discount: number;
  if (record.discountType === "percentage") {
    discount = invoiceTotal * ((record.discountValue as number) / 100);
  } else {
    // Cap flat discount so it never exceeds the invoice total
    discount = Math.min(record.discountValue as number, invoiceTotal);
  }

  // Atomically increment timesUsed
  await api.internal.promoCode.update(record.id, { timesUsed: (record.timesUsed ?? 0) + 1 });

  // Re-read to detect race condition where two concurrent applies both passed the guard
  const updated = await api.promoCode.findOne(record.id, { select: { timesUsed: true, maxUses: true } });
  if (
    updated.maxUses !== null &&
    updated.maxUses !== undefined &&
    (updated.timesUsed ?? 0) > (updated.maxUses as number)
  ) {
    // Roll back the increment to the original value
    await api.internal.promoCode.update(record.id, { timesUsed: record.timesUsed });
    throw new Error("This promo code has reached its maximum number of uses.");
  }

  return { discountAmount: discount, promoCodeId: record.id };
};

export const params = {
  invoiceTotal: { type: "number" },
};

export const options: ActionOptions = {
  actionType: "custom",
  returnType: true,
};
