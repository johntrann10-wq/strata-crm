import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import { requestId, requestLogging } from "./middleware/logging.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { optionalAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { businessesRouter } from "./routes/businesses.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { invoicesRouter } from "./routes/invoices.js";
import { invoiceLineItemsRouter } from "./routes/invoice-line-items.js";
import { paymentsRouter } from "./routes/payments.js";
import { clientsRouter } from "./routes/clients.js";
import { vehiclesRouter } from "./routes/vehicles.js";
import { quotesRouter } from "./routes/quotes.js";
import { staffRouter } from "./routes/staff.js";
import { locationsRouter } from "./routes/locations.js";
import { servicesRouter } from "./routes/services.js";
import { actionsRouter } from "./routes/actions.js";
import { activityLogsRouter } from "./routes/activity-logs.js";
import { notificationLogsRouter } from "./routes/notification-logs.js";
import { billingRouter, handleStripeWebhook } from "./routes/billing.js";
import { requireSubscription } from "./middleware/subscription.js";
const app = express();
// CORS: when frontend and backend are on different origins (e.g. Vercel + Railway)
const frontendOrigin = process.env.FRONTEND_URL ?? process.env.CORS_ORIGIN;
if (frontendOrigin) {
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", frontendOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-cron-secret");
    if (_req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
}
// Stripe webhook needs raw body (must be before express.json())
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => handleStripeWebhook(req, res).catch(next)
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(
  (session as (opts: {
    secret: string;
    resave: boolean;
    saveUninitialized: boolean;
    cookie: {
      secure: boolean;
      httpOnly: boolean;
      maxAge: number;
      sameSite: "lax" | "strict" | "none";
    };
  }) => express.RequestHandler)({
    secret: process.env.SESSION_SECRET ?? "strata-dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "none",
    },
  })
);
app.use(requestId);
app.use(requestLogging);
app.use("/api/auth", authRouter);
app.use("/api/users", optionalAuth, usersRouter);
app.use("/api/billing", billingRouter);
app.use("/api/businesses", optionalAuth, requireSubscription, businessesRouter);
app.use("/api/appointments", optionalAuth, requireSubscription, appointmentsRouter);
app.use("/api/invoices", optionalAuth, requireSubscription, invoicesRouter);
app.use("/api/invoice-line-items", optionalAuth, requireSubscription, invoiceLineItemsRouter);
app.use("/api/payments", optionalAuth, requireSubscription, paymentsRouter);
app.use("/api/clients", optionalAuth, requireSubscription, clientsRouter);
app.use("/api/vehicles", optionalAuth, requireSubscription, vehiclesRouter);
app.use("/api/quotes", optionalAuth, requireSubscription, quotesRouter);
app.use("/api/staff", optionalAuth, requireSubscription, staffRouter);
app.use("/api/locations", optionalAuth, requireSubscription, locationsRouter);
app.use("/api/services", optionalAuth, requireSubscription, servicesRouter);
app.use("/api/actions", optionalAuth, requireSubscription, actionsRouter);
app.use("/api/activity-logs", optionalAuth, requireSubscription, activityLogsRouter);
app.use("/api/notification-logs", optionalAuth, requireSubscription, notificationLogsRouter);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use(errorHandler);
export { app };
