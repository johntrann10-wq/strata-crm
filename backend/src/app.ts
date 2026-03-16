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

const app = express();

// CORS: when frontend and backend are on different origins (e.g. Vercel + Render)
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

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(
  (session as (opts: { secret: string; resave: boolean; saveUninitialized: boolean; cookie: object }) => express.RequestHandler)({
    secret: process.env.SESSION_SECRET ?? "strata-dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production", httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);
app.use(requestId);
app.use(requestLogging);

app.use("/api/auth", authRouter);
app.use("/api/users", optionalAuth, usersRouter);
app.use("/api/businesses", optionalAuth, businessesRouter);
app.use("/api/appointments", optionalAuth, appointmentsRouter);
app.use("/api/invoices", optionalAuth, invoicesRouter);
app.use("/api/invoice-line-items", optionalAuth, invoiceLineItemsRouter);
app.use("/api/payments", optionalAuth, paymentsRouter);
app.use("/api/clients", optionalAuth, clientsRouter);
app.use("/api/vehicles", optionalAuth, vehiclesRouter);
app.use("/api/quotes", optionalAuth, quotesRouter);
app.use("/api/staff", optionalAuth, staffRouter);
app.use("/api/locations", optionalAuth, locationsRouter);
app.use("/api/services", optionalAuth, servicesRouter);
app.use("/api/actions", optionalAuth, actionsRouter);
app.use("/api/activity-logs", optionalAuth, activityLogsRouter);
app.use("/api/notification-logs", optionalAuth, notificationLogsRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use(errorHandler);

export { app };
