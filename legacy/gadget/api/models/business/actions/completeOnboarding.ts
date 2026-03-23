import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "owner" });
  record.onboardingComplete = true;
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api }) => {
  try {
    await api.seedServiceTemplates({ businessId: record.id, businessType: record.type });
    logger.info({ businessId: record.id, businessType: record.type }, "Onboarding completed and default service templates seeded");
  } catch (error) {
    logger.warn({ error, businessId: record.id }, "Failed to seed service templates after onboarding; onboarding is still complete");
  }
};

export const options: ActionOptions = {
  actionType: "custom",
};
