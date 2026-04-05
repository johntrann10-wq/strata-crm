export function getIntegrationRetryDelayMs(attemptCount: number): number {
  const cappedAttempt = Math.max(0, Math.min(attemptCount, 8));
  const base = 60_000;
  const max = 60 * 60 * 1000;
  return Math.min(base * 2 ** cappedAttempt, max);
}

export function getIntegrationNextRunAt(attemptCount: number, now = new Date()): Date {
  return new Date(now.getTime() + getIntegrationRetryDelayMs(attemptCount));
}

