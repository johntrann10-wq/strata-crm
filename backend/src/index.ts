import { app } from "./app.js";
import { closeDb, verifyRuntimeSchema } from "./db/index.js";
import { logger } from "./lib/logger.js";

const PORT = process.env.PORT!;

async function start(): Promise<void> {
  try {
    await verifyRuntimeSchema();
  } catch (error) {
    logger.error("Startup schema verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    await closeDb().catch(() => undefined);
    process.exit(1);
    return;
  }

  app.listen(PORT, () => {
    logger.info("Strata backend listening", { port: PORT });
  });
}

void start();
