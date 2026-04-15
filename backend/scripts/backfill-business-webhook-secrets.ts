import "dotenv/config";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { businesses } from "../src/db/schema.js";
import {
  isLegacyPlaintextWebhookSecret,
  normalizeBusinessWebhookSecretForStorage,
} from "../src/lib/businessWebhookSecret.js";
import { validateEnv } from "../src/lib/env.js";
import { logger } from "../src/lib/logger.js";

async function run() {
  validateEnv();

  const rows = await db
    .select({
      id: businesses.id,
      integrationWebhookSecret: businesses.integrationWebhookSecret,
    })
    .from(businesses)
    .where(isNotNull(businesses.integrationWebhookSecret));

  let migrated = 0;
  let alreadyEncrypted = 0;

  for (const row of rows) {
    if (!isLegacyPlaintextWebhookSecret(row.integrationWebhookSecret)) {
      alreadyEncrypted += 1;
      continue;
    }
    const encryptedSecret = normalizeBusinessWebhookSecretForStorage(row.integrationWebhookSecret);
    await db
      .update(businesses)
      .set({
        integrationWebhookSecret: encryptedSecret,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, row.id));
    migrated += 1;
  }

  logger.info("Business webhook secret backfill complete", {
    scanned: rows.length,
    migrated,
    alreadyEncrypted,
  });
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error("Business webhook secret backfill failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
