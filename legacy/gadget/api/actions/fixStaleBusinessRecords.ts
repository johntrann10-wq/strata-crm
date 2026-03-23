import { ActionOptions } from "gadget-server";

const VALID_TYPES = new Set([
  "auto-detailing",
  "window-tinting",
  "wrap-ppf",
  "auto-body-collision",
  "tire-wheel-alignment",
  "performance-customization",
  "mobile-services",
  "general-automotive",
  "other",
]);

export const run: ActionRun = async ({ logger, api }) => {
  const records = await api.internal.business.findMany({
    select: { id: true, type: true, onboardingComplete: true, ownerId: true },
    first: 250,
  });

  let fixed = 0;

  for (const record of records) {
    const needsTypefix = !record.type || !VALID_TYPES.has(record.type);
    const needsOnboardingFix = !record.onboardingComplete;

    if (needsTypefix || needsOnboardingFix) {
      const update: Record<string, unknown> = {};
      if (needsTypefix) {
        update.type = "general-automotive";
      }
      if (needsOnboardingFix) {
        update.onboardingComplete = true;
      }
      await api.internal.business.update(record.id, update);
      fixed++;
    }
  }

  logger.info({ fixed }, `Fixed ${fixed} stale business records`);

  return { fixed };
};

export const options: ActionOptions = {
  triggers: { api: true },
  returnType: true,
};
