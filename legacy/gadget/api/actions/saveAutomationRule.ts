import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  const userId = session?.get("user") as string | undefined;
  if (!userId) throw new Error("Not authenticated");

  const business = await api.business.maybeFindFirst({
    filter: { owner: { id: { equals: userId } } },
    select: { id: true },
  });
  if (!business) throw new Error("Business not found");

  const ruleId = params.ruleId as string | undefined;
  const triggerType = params.triggerType as string;
  const enabled = params.enabled as boolean;
  const delayHours = (params.delayHours as number) ?? 0;
  const customMessage = (params.customMessage as string) ?? "";

  if (ruleId) {
    const rule = await api.automationRule.maybeFindOne(ruleId, { select: { id: true, businessId: true } });
    if (!rule) throw new Error("Automation rule not found");
    if (rule.businessId !== business.id) throw new Error("Unauthorized: this automation rule does not belong to your business.");
    return await api.automationRule.update(ruleId, { enabled, delayHours, customMessage });
  } else {
    return await api.automationRule.create({
      triggerType: triggerType as any,
      enabled,
      delayHours,
      customMessage,
      business: { _link: business.id },
    });
  }
};

export const params = {
  ruleId: { type: "string" },
  triggerType: { type: "string" },
  enabled: { type: "boolean" },
  delayHours: { type: "number" },
  customMessage: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true },
};
