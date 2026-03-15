import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const typeMapping: Record<string, string> = {
    "auto-detailing": "auto_detailing",
    "mobile-detailing": "mobile_detailing",
    "ppf-ceramic": "ppf_ceramic",
    "tint-shop": "tint_shop",
    "car-wash": "car_wash",
    "wrap-shop": "wrap_shop",
    "tire-shop": "tire_shop",
    "dealership-service": "dealership_service",
    "other-auto-service": "other_auto_service",
  };

  const businesses = await api.internal.business.findMany({
    first: 250,
    select: { id: true, type: true },
  });

  let migrated = 0;
  const details: string[] = [];

  for (const business of businesses) {
    const oldType = business.type as string | null;
    if (oldType && typeMapping[oldType]) {
      const newType = typeMapping[oldType];
      await api.internal.business.update(business.id, { type: newType });
      const detail = `Business ${business.id}: "${oldType}" -> "${newType}"`;
      logger.info({ businessId: business.id, oldType, newType }, detail);
      details.push(detail);
      migrated++;
    }
  }

  return { migrated, details };
};

export const options: ActionOptions = {
  triggers: { api: true },
  returnType: true,
};
