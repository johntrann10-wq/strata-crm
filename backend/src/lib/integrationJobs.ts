import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  integrationConnections,
  integrationJobAttempts,
  integrationJobs,
} from "../db/schema.js";
import { logger } from "./logger.js";
import type { IntegrationProvider } from "./integrationFeatureFlags.js";
import { getIntegrationNextRunAt } from "./integrationRetry.js";

export type IntegrationJobRecord = typeof integrationJobs.$inferSelect;

type SerializablePayload = Record<string, unknown>;

export async function enqueueIntegrationJob(input: {
  businessId: string;
  provider: IntegrationProvider;
  jobType: string;
  idempotencyKey: string;
  payload: SerializablePayload;
  connectionId?: string | null;
  maxAttempts?: number;
  createdByUserId?: string | null;
}) {
  const [job] = await db
    .insert(integrationJobs)
    .values({
      businessId: input.businessId,
      provider: input.provider,
      jobType: input.jobType,
      idempotencyKey: input.idempotencyKey,
      payload: JSON.stringify(input.payload),
      connectionId: input.connectionId ?? null,
      maxAttempts: input.maxAttempts ?? 5,
      createdByUserId: input.createdByUserId ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (!job) {
    const [existing] = await db
      .select()
      .from(integrationJobs)
      .where(
        and(
          eq(integrationJobs.businessId, input.businessId),
          eq(integrationJobs.provider, input.provider),
          eq(integrationJobs.jobType, input.jobType),
          eq(integrationJobs.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    return existing ?? null;
  }

  return job;
}

export async function listIntegrationFailures(businessId: string, limit = 20) {
  return db
    .select({
      id: integrationJobs.id,
      provider: integrationJobs.provider,
      jobType: integrationJobs.jobType,
      status: integrationJobs.status,
      attemptCount: integrationJobs.attemptCount,
      maxAttempts: integrationJobs.maxAttempts,
      lastError: integrationJobs.lastError,
      deadLetteredAt: integrationJobs.deadLetteredAt,
      nextRunAt: integrationJobs.nextRunAt,
      updatedAt: integrationJobs.updatedAt,
      displayName: integrationConnections.displayName,
    })
    .from(integrationJobs)
    .leftJoin(integrationConnections, eq(integrationJobs.connectionId, integrationConnections.id))
    .where(
      and(
        eq(integrationJobs.businessId, businessId),
        or(eq(integrationJobs.status, "failed"), eq(integrationJobs.status, "dead_letter"))
      )
    )
    .orderBy(asc(integrationJobs.nextRunAt))
    .limit(limit);
}

export async function retryIntegrationJobForBusiness(businessId: string, jobId: string) {
  const [job] = await db
    .update(integrationJobs)
    .set({
      status: "pending",
      nextRunAt: new Date(),
      lastError: null,
      deadLetteredAt: null,
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(and(eq(integrationJobs.businessId, businessId), eq(integrationJobs.id, jobId)))
    .returning();
  return job ?? null;
}

export async function claimDueIntegrationJobs(limit: number, workerId: string) {
  const result = await db.execute(sql`
    with due_jobs as (
      select id
      from integration_jobs
      where status in ('pending', 'failed')
        and next_run_at <= now()
        and (locked_at is null or locked_at < now() - interval '10 minutes')
      order by next_run_at asc
      limit ${limit}
      for update skip locked
    )
    update integration_jobs jobs
    set
      status = 'processing',
      locked_at = now(),
      locked_by = ${workerId},
      updated_at = now()
    from due_jobs
    where jobs.id = due_jobs.id
    returning jobs.*;
  `);
  return result.rows as IntegrationJobRecord[];
}

export async function markIntegrationJobSucceeded(jobId: string, requestSnapshot?: SerializablePayload, responseSnapshot?: SerializablePayload) {
  const now = new Date();
  const [job] = await db
    .update(integrationJobs)
    .set({
      status: "succeeded",
      attemptCount: sql`${integrationJobs.attemptCount} + 1`,
      lastAttemptAt: now,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      updatedAt: now,
    })
    .where(eq(integrationJobs.id, jobId))
    .returning();

  if (!job) return null;

  await db.insert(integrationJobAttempts).values({
    jobId,
    businessId: job.businessId,
    provider: job.provider,
    attemptNumber: (job.attemptCount ?? 0) + 1,
    status: "succeeded",
    requestSnapshot: requestSnapshot ? JSON.stringify(requestSnapshot) : null,
    responseSnapshot: responseSnapshot ? JSON.stringify(responseSnapshot) : null,
    finishedAt: now,
  });

  return job;
}

export async function markIntegrationJobFailed(
  job: Pick<IntegrationJobRecord, "id" | "businessId" | "provider" | "attemptCount" | "maxAttempts">,
  error: unknown,
  requestSnapshot?: SerializablePayload,
  responseSnapshot?: SerializablePayload
) {
  const message = error instanceof Error ? error.message : String(error);
  const nextAttempt = (job.attemptCount ?? 0) + 1;
  const shouldDeadLetter = nextAttempt >= (job.maxAttempts ?? 5);
  const now = new Date();

  await db
    .update(integrationJobs)
    .set({
      status: shouldDeadLetter ? "dead_letter" : "failed",
      attemptCount: nextAttempt,
      lastAttemptAt: now,
      nextRunAt: shouldDeadLetter ? now : getIntegrationNextRunAt(nextAttempt, now),
      lastError: message,
      deadLetteredAt: shouldDeadLetter ? now : null,
      lockedAt: null,
      lockedBy: null,
      updatedAt: now,
    })
    .where(eq(integrationJobs.id, job.id));

  await db.insert(integrationJobAttempts).values({
    jobId: job.id,
    businessId: job.businessId,
    provider: job.provider,
    attemptNumber: nextAttempt,
    status: shouldDeadLetter ? "dead_letter" : "failed",
    requestSnapshot: requestSnapshot ? JSON.stringify(requestSnapshot) : null,
    responseSnapshot: responseSnapshot ? JSON.stringify(responseSnapshot) : null,
    error: message,
    finishedAt: now,
  });

  logger.warn("Integration job failed", {
    jobId: job.id,
    businessId: job.businessId,
    provider: job.provider,
    attemptCount: nextAttempt,
    deadLettered: shouldDeadLetter,
    error: message,
  });
}

