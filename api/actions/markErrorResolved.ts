import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, session, api }) => {
  const userId = session?.get("user");

  const record = await api.systemErrorLog.maybeFindOne(params.id as string, {
    select: { id: true, businessId: true, resolved: true },
  });

  if (!record) {
    throw new Error("Error log record not found");
  }

  if (record.businessId !== userId) {
    throw new Error("Unauthorized");
  }

  if (record.resolved) {
    return { success: true, alreadyResolved: true };
  }

  await api.internal.systemErrorLog.update(params.id as string, {
    resolved: true,
    resolvedAt: new Date(),
  });

  return { success: true, alreadyResolved: false };
};

export const params = {
  id: { type: "string" },
};

export const options: ActionOptions = {
  returnType: true,
  triggers: { api: true },
};
