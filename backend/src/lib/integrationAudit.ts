import { createActivityLog } from "./activity.js";
import type { IntegrationProvider } from "./integrationFeatureFlags.js";

export async function createIntegrationAuditLog(input: {
  businessId: string;
  provider: IntegrationProvider;
  action: string;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await createActivityLog({
    businessId: input.businessId,
    action: `integration.${input.provider}.${input.action}`,
    entityType: "integration",
    metadata: input.metadata ?? null,
    userId: input.userId ?? null,
  });
}

