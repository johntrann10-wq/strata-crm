import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import { requestId, requestLogging } from "./middleware/logging.js";
import { errorHandler } from "./middleware/errorHandler.js";
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
import { clientsRouter } from "./routes/clients.js";
import { vehiclesRouter } from "./routes/vehicles.js";
import { vehicleCatalogRouter } from "./routes/vehicle-catalog.js";
import { quotesRouter } from "./routes/quotes.js";
import { staffRouter } from "./routes/staff.js";
import { locationsRouter } from "./routes/locations.js";
import { servicesRouter } from "./routes/services.js";
import { serviceAddonLinksRouter } from "./routes/service-addon-links.js";
import { jobsRouter } from "./routes/jobs.js";
import { actionsRouter } from "./routes/actions.js";
import { activityLogsRouter } from "./routes/activity-logs.js";
import { notificationLogsRouter } from "./routes/notification-logs.js";
import { billingRouter, handleStripeWebhook } from "./routes/billing.js";

validateEnv();

const app = express();

// CORS: Vercel → Railway (or local Vite → local API). Exact origins only — see `buildCorsAllowedOrigins`.
// JWT uses `Authorization`; preflight OPTIONS is answered before routes.
const corsAllowedOrigins = buildCorsAllowedOrigins();
app.use(corsMiddleware(corsAllowedOrigins));

// Stripe webhook needs raw body (must be before express.json())
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => handleStripeWebhook(req, res).catch(next)
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(
  (session as (opts: { secret: string; resave: boolean; saveUninitialized: boolean; cookie: object }) => express.RequestHandler)({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production", httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);
app.use(requestId);
app.use(requestLogging);

app.use("/api/auth", authRouter);
app.use("/api/users", optionalAuth, usersRouter);
app.use("/api/billing", billingRouter);
app.use("/api/businesses", optionalAuth, businessesRouter);
app.use("/api/appointments", optionalAuth, requireSubscription, appointmentsRouter);
app.use("/api/invoices", optionalAuth, requireSubscription, invoicesRouter);
app.use("/api/invoice-line-items", optionalAuth, requireSubscription, invoiceLineItemsRouter);
app.use("/api/appointment-services", optionalAuth, requireSubscription, appointmentServicesRouter);
app.use("/api/payments", optionalAuth, requireSubscription, paymentsRouter);
app.use("/api/clients", optionalAuth, requireSubscription, clientsRouter);
app.use("/api/vehicles", optionalAuth, requireSubscription, vehiclesRouter);
app.use("/api/vehicle-catalog", optionalAuth, vehicleCatalogRouter);
app.use("/api/quotes", optionalAuth, requireSubscription, quotesRouter);
app.use("/api/quote-line-items", optionalAuth, requireSubscription, quoteLineItemsRouter);
app.use("/api/staff", optionalAuth, staffRouter);
app.use("/api/locations", optionalAuth, locationsRouter);
app.use("/api/services", optionalAuth, servicesRouter);
app.use("/api/service-addon-links", optionalAuth, serviceAddonLinksRouter);
app.use("/api/jobs", optionalAuth, requireSubscription, jobsRouter);
app.use("/api/actions", optionalAuth, actionsRouter);
app.use("/api/activity-logs", optionalAuth, requireSubscription, activityLogsRouter);
app.use("/api/notification-logs", optionalAuth, requireSubscription, notificationLogsRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use(errorHandler);

export { app };
