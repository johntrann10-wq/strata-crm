import { expect, type Page } from "@playwright/test";

const RUNTIME_ERRORS_KEY = "strata.runtimeErrors";
const RELIABILITY_DIAGNOSTICS_KEY = "strata.reliabilityDiagnostics";

export async function clearClientDiagnostics(page: Page): Promise<void> {
  await page.evaluate(
    ({ runtimeKey, reliabilityKey }) => {
      window.sessionStorage.removeItem(runtimeKey);
      window.sessionStorage.removeItem(reliabilityKey);
    },
    { runtimeKey: RUNTIME_ERRORS_KEY, reliabilityKey: RELIABILITY_DIAGNOSTICS_KEY }
  );
}

export async function readClientDiagnostics(page: Page): Promise<{
  runtimeErrors: unknown[];
  reliabilityDiagnostics: unknown[];
}> {
  return page.evaluate(
    ({ runtimeKey, reliabilityKey }) => {
      const read = (key: string) => {
        try {
          const raw = window.sessionStorage.getItem(key);
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };

      return {
        runtimeErrors: read(runtimeKey),
        reliabilityDiagnostics: read(reliabilityKey),
      };
    },
    { runtimeKey: RUNTIME_ERRORS_KEY, reliabilityKey: RELIABILITY_DIAGNOSTICS_KEY }
  );
}

export async function expectNoClientDiagnostics(page: Page): Promise<void> {
  const diagnostics = await readClientDiagnostics(page);
  expect(diagnostics.runtimeErrors).toEqual([]);
  expect(diagnostics.reliabilityDiagnostics).toEqual([]);
}
