import { Router, Request, Response } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { createRateLimiter } from "../middleware/security.js";
import { BadRequestError } from "../lib/errors.js";

export const clientDiagnosticsRouter = Router();

const clientDiagnosticsLimiter = createRateLimiter({
  id: "client_diagnostics",
  windowMs: 10 * 60 * 1000,
  max: 80,
  message: "Too many client diagnostics submitted. Please wait a bit before trying again.",
  key: ({ businessId, userId, ip }) => `client-diagnostics:${businessId ?? "none"}:${userId ?? ip}`,
});

const diagnosticEventSchema = z.object({
  category: z.enum(["runtime_error", "reliability"]),
  source: z.string().trim().min(1).max(80),
  severity: z.enum(["info", "warning", "error"]).default("error"),
  message: z.string().trim().min(1).max(400),
  detail: z.string().trim().max(2000).optional(),
  path: z.string().trim().max(400).optional(),
  method: z.string().trim().max(16).optional(),
  status: z.number().int().min(0).max(599).optional(),
  timestamp: z.string().trim().max(80),
  appShell: z.boolean().optional(),
  userAgent: z.string().trim().max(280).optional(),
});

const reportSchema = z.object({
  events: z.array(diagnosticEventSchema).min(1).max(10),
});

function isClientErrorReportingEnabled(): boolean {
  const configured = process.env.CLIENT_ERROR_REPORTING_ENABLED?.trim().toLowerCase();
  if (!configured) return process.env.NODE_ENV === "production";
  return configured !== "false" && configured !== "0" && configured !== "off";
}

clientDiagnosticsRouter.post(
  "/report",
  clientDiagnosticsLimiter.middleware,
  wrapAsync(async (req: Request, res: Response) => {
    if (!isClientErrorReportingEnabled()) {
      res.status(202).json({ ok: true, accepted: 0, disabled: true });
      return;
    }

    const parsed = reportSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new BadRequestError("Valid client diagnostics payload required.");
    }

    for (const event of parsed.data.events) {
      const logPayload = {
        businessId: req.businessId ?? undefined,
        userId: req.userId ?? undefined,
        source: event.source,
        category: event.category,
        path: event.path ?? undefined,
        method: event.method ?? undefined,
        status: event.status ?? undefined,
        timestamp: event.timestamp,
        appShell: event.appShell ?? false,
        userAgent: event.userAgent ?? undefined,
        detail: event.detail ?? undefined,
      };

      if (event.severity === "info") {
        logger.info(`Client ${event.category}: ${event.message}`, logPayload);
      } else if (event.severity === "warning") {
        logger.warn(`Client ${event.category}: ${event.message}`, logPayload);
      } else {
        logger.error(`Client ${event.category}: ${event.message}`, logPayload);
      }
    }

    res.status(202).json({ ok: true, accepted: parsed.data.events.length });
  })
);
