import "dotenv/config";
import express from "express";
import { requestId, requestLogging } from "./middleware/logging.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { noStore, securityHeaders } from "./middleware/security.js";
import { optionalAuth } from "./middleware/auth.js";
import { requireSubscription } from "./middleware/subscription.js";
import { validateEnv } from "./lib/env.js";
import { buildCorsAllowedOrigins, corsMiddleware } from "./lib/cors.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { businessesRouter } from "./routes/businesses.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { invoicesRouter } from "./routes/invoices.js";
import { invoiceLineItemsRouter } from "./routes/invoice-line-items.js";
import { appointmentServicesRouter } from "./routes/appointment-services.js";
import { quoteLineItemsRouter } from "./routes/quote-line-items.js";
import { paymentsRouter } from "./routes/payments.js";
import { expensesRouter } from "./routes/expenses.js";
import { clientsRouter } from "./routes/clients.js";
import { vehiclesRouter } from "./routes/vehicles.js";
import { vehicleCatalogRouter } from "./routes/vehicle-catalog.js";
import { quotesRouter } from "./routes/quotes.js";
import { staffRouter } from "./routes/staff.js";
import { locationsRouter } from "./routes/locations.js";
import { servicesRouter } from "./routes/services.js";
import { serviceCategoriesRouter } from "./routes/service-categories.js";
import { serviceAddonLinksRouter } from "./routes/service-addon-links.js";
import { jobsRouter } from "./routes/jobs.js";
import { actionsRouter } from "./routes/actions.js";
import { activityLogsRouter } from "./routes/activity-logs.js";
import { notificationLogsRouter } from "./routes/notification-logs.js";
import {
  handleGoogleCalendarCallbackRoute,
  handleTwilioVoiceWebhookRoute,
  handleTwilioStatusCallbackRoute,
  integrationsRouter,
} from "./routes/integrations.js";
import { billingRouter, handleStripeWebhook } from "./routes/billing.js";
import { portalRouter } from "./routes/portal.js";
import { invalidateHomeDashboardCache } from "./lib/homeDashboard.js";

validateEnv();

const app = express();
app.disable("x-powered-by");
const trustProxy = process.env.TRUST_PROXY?.trim();
if (trustProxy) {
  app.set("trust proxy", trustProxy);
} else if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", "loopback");
}

function dashboardMutationInvalidation(req: express.Request, res: express.Response, next: express.NextFunction) {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    next();
    return;
  }
  if (req.baseUrl === "/api/actions" && /^\/get/i.test(req.path)) {
    next();
    return;
  }
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const businessId =
      (typeof req.businessId === "string" && req.businessId) ||
      (typeof req.headers["x-business-id"] === "string" ? req.headers["x-business-id"] : null);
    if (!businessId) return;
    invalidateHomeDashboardCache({
      businessId,
      reason: `${method} ${req.baseUrl || req.path}`,
    });
  });
  next();
}

// CORS: Vercel → Railway (or local Vite → local API). Exact origins only — see `buildCorsAllowedOrigins`.
// JWT uses `Authorization`; preflight OPTIONS is answered before routes.
const corsAllowedOrigins = buildCorsAllowedOrigins();
app.use(corsMiddleware(corsAllowedOrigins));
app.use(securityHeaders);

// Stripe webhook needs raw body (must be before express.json())
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => handleStripeWebhook(req, res).catch(next)
);
app.post(
  "/api/integrations/twilio/status/:connectionId",
  express.urlencoded({ extended: false }),
  (req, res, next) => handleTwilioStatusCallbackRoute(req, res).catch(next)
);
app.post(
  "/api/integrations/twilio/voice/:connectionId",
  express.urlencoded({ extended: false }),
  (req, res, next) => handleTwilioVoiceWebhookRoute(req, res).catch(next)
);
app.get("/api/integrations/google-calendar/callback", (req, res, next) =>
  handleGoogleCalendarCallbackRoute(req, res).catch(next)
);

app.use(express.json({ limit: "1mb" }));
app.use(requestId);
app.use(requestLogging);

app.use("/api/auth", noStore, authRouter);
app.use("/api/portal", portalRouter);
app.use("/api/users", optionalAuth, usersRouter);
app.use("/api/billing", billingRouter);
app.use("/api/businesses", optionalAuth, dashboardMutationInvalidation, businessesRouter);
app.use("/api/appointments", optionalAuth, requireSubscription, dashboardMutationInvalidation, appointmentsRouter);
app.use("/api/invoices", optionalAuth, requireSubscription, dashboardMutationInvalidation, invoicesRouter);
app.use("/api/invoice-line-items", optionalAuth, requireSubscription, invoiceLineItemsRouter);
app.use("/api/appointment-services", optionalAuth, requireSubscription, appointmentServicesRouter);
app.use("/api/payments", optionalAuth, requireSubscription, dashboardMutationInvalidation, paymentsRouter);
app.use("/api/expenses", optionalAuth, requireSubscription, expensesRouter);
app.use("/api/clients", optionalAuth, requireSubscription, dashboardMutationInvalidation, clientsRouter);
app.use("/api/vehicles", optionalAuth, requireSubscription, vehiclesRouter);
app.use("/api/vehicle-catalog", optionalAuth, vehicleCatalogRouter);
app.use("/api/quotes", optionalAuth, requireSubscription, dashboardMutationInvalidation, quotesRouter);
app.use("/api/quote-line-items", optionalAuth, requireSubscription, quoteLineItemsRouter);
app.use("/api/staff", optionalAuth, dashboardMutationInvalidation, staffRouter);
app.use("/api/locations", optionalAuth, dashboardMutationInvalidation, locationsRouter);
app.use("/api/services", optionalAuth, servicesRouter);
app.use("/api/service-categories", optionalAuth, serviceCategoriesRouter);
app.use("/api/service-addon-links", optionalAuth, serviceAddonLinksRouter);
app.use("/api/jobs", optionalAuth, requireSubscription, jobsRouter);
app.use("/api/actions", optionalAuth, dashboardMutationInvalidation, actionsRouter);
app.use("/api/activity-logs", optionalAuth, requireSubscription, activityLogsRouter);
app.use("/api/notification-logs", optionalAuth, requireSubscription, notificationLogsRouter);
app.use("/api/integrations", optionalAuth, requireSubscription, integrationsRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use(errorHandler);

export { app };
