/**
 * Drizzle schema — multi-tenant; all tenant data scoped by businessId (business.ownerId = user.id).
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  decimal,
  integer,
  pgEnum,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const businessTypeEnum = pgEnum("business_type", [
  "auto_detailing",
  "mobile_detailing",
  "wrap_ppf",
  "window_tinting",
  "performance",
  "mechanic",
  "tire_shop",
  "muffler_shop",
]);
const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled", "confirmed", "in_progress", "completed", "cancelled", "no-show",
]);
const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "partial", "void"]);
const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "accepted", "declined", "expired"]);
const paymentMethodEnum = pgEnum("payment_method", [
  "cash", "card", "check", "venmo", "cashapp", "zelle", "other",
]);
export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "manager",
  "service_advisor",
  "technician",
]);
export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
]);
export const permissionEnum = pgEnum("permission", [
  "dashboard.view",
  "customers.read",
  "customers.write",
  "vehicles.read",
  "vehicles.write",
  "services.read",
  "services.write",
  "quotes.read",
  "quotes.write",
  "appointments.read",
  "appointments.write",
  "jobs.read",
  "jobs.write",
  "invoices.read",
  "invoices.write",
  "payments.read",
  "payments.write",
  "team.read",
  "team.write",
  "settings.read",
  "settings.write",
]);

/** Universal service category — same structure for every shop type; no industry-specific logic in app code. */
export const serviceCategoryEnum = pgEnum("service_category", [
  "detail",
  "tint",
  "ppf",
  "mechanical",
  "tire",
  "body",
  "other",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  emailVerified: boolean("email_verified").default(false),
  googleProfileId: text("google_profile_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  type: businessTypeEnum("type").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  timezone: text("timezone").default("America/New_York"),
  currency: text("currency").default("USD"),
  defaultTaxRate: decimal("default_tax_rate", { precision: 5, scale: 2 }).default("0"),
  appointmentBufferMinutes: integer("appointment_buffer_minutes").default(15),
  nextInvoiceNumber: integer("next_invoice_number").default(1).notNull(),
  onboardingComplete: boolean("onboarding_complete").default(false),
  staffCount: integer("staff_count"),
  operatingHours: text("operating_hours"),
  // Stripe subscription: $29/mo, first month free (trial)
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"), // trialing|active|past_due|canceled|incomplete_expired
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const businessMemberships = pgTable(
  "business_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    status: membershipStatusEnum("status").default("active").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("business_memberships_business_user_unique").on(t.businessId, t.userId)]
);

export const rolePermissionGrants = pgTable(
  "role_permission_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    permission: permissionEnum("permission").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("role_permission_grants_scope_role_permission_unique").on(t.businessId, t.role, t.permission)]
);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  marketingOptIn: boolean("marketing_opt_in").default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year"),
  trim: text("trim"),
  bodyStyle: text("body_style"),
  engine: text("engine"),
  color: text("color"),
  licensePlate: text("license_plate"),
  vin: text("vin"),
  displayName: text("display_name"),
  source: text("source"),
  sourceVehicleId: text("source_vehicle_id"),
  mileage: integer("mileage"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  timezone: text("timezone"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  userId: uuid("user_id").references(() => users.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  role: text("role").default("technician"),
  active: boolean("active").default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
  assignedStaffId: uuid("assigned_staff_id").references(() => staff.id),
  locationId: uuid("location_id").references(() => locations.id),
  title: text("title"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  status: appointmentStatusEnum("status").default("scheduled").notNull(),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).default("0"),
  depositAmount: decimal("deposit_amount", { precision: 12, scale: 2 }).default("0"),
  depositPaid: boolean("deposit_paid").default(false),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  /** Internal / shop notes — not industry-specific; optional. */
  notes: text("notes"),
  price: decimal("price", { precision: 12, scale: 2 }).default("0"),
  /** Estimated job duration in minutes. */
  durationMinutes: integer("duration_minutes"),
  category: serviceCategoryEnum("category").default("other").notNull(),
  taxable: boolean("taxable").default(true),
  /** When true, service is intended as an add-on to another line item (still configurable). */
  isAddon: boolean("is_addon").default(false),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Optional add-ons: parent service → offered add-on service (same tenant, no business rules in DB). */
export const serviceAddonLinks = pgTable(
  "service_addon_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    parentServiceId: uuid("parent_service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    addonServiceId: uuid("addon_service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("service_addon_links_parent_addon").on(t.parentServiceId, t.addonServiceId)]
);

export const appointmentServices = pgTable("appointment_services", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointments.id),
  serviceId: uuid("service_id").notNull().references(() => services.id),
  quantity: integer("quantity").default(1),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  appointmentId: uuid("appointment_id").references(() => appointments.id),
  invoiceNumber: text("invoice_number").unique(),
  status: invoiceStatusEnum("status").default("draft").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  method: paymentMethodEnum("method").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
  idempotencyKey: text("idempotency_key"),
  notes: text("notes"),
  referenceNumber: text("reference_number"),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  appointmentId: uuid("appointment_id").references(() => appointments.id),
  status: quoteStatusEnum("status").default("draft").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  followUpSentAt: timestamp("follow_up_sent_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const quoteLineItems = pgTable("quote_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  userId: uuid("user_id").references(() => users.id),
  metadata: text("metadata"), // JSON
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notificationLogs = pgTable("notification_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  channel: text("channel").notNull(),
  recipient: text("recipient").notNull(),
  subject: text("subject"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  error: text("error"),
  metadata: text("metadata"),
  retryCount: integer("retry_count").default(0).notNull(),
  lastRetryAt: timestamp("last_retry_at", { withTimezone: true }),
});

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").references(() => businesses.id), // null = system default
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    idempotencyKey: text("idempotency_key").notNull(),
    businessId: uuid("business_id").notNull(),
    operation: text("operation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.idempotencyKey, t.businessId, t.operation] })]
);
