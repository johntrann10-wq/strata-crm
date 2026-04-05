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
const appointmentJobPhaseEnum = pgEnum("appointment_job_phase", [
  "scheduled",
  "active_work",
  "waiting",
  "curing",
  "hold",
  "pickup_ready",
]);
const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "partial", "void"]);
const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "accepted", "declined", "expired"]);
const paymentMethodEnum = pgEnum("payment_method", [
  "cash", "card", "check", "venmo", "cashapp", "zelle", "other",
]);
export const integrationProviderEnum = pgEnum("integration_provider", [
  "quickbooks_online",
  "twilio_sms",
  "google_calendar",
  "outbound_webhooks",
]);
export const integrationOwnerTypeEnum = pgEnum("integration_owner_type", ["business", "user"]);
export const integrationConnectionStatusEnum = pgEnum("integration_connection_status", [
  "pending",
  "connected",
  "action_required",
  "error",
  "disconnected",
]);
export const integrationJobStatusEnum = pgEnum("integration_job_status", [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "dead_letter",
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
  defaultAdminFee: decimal("default_admin_fee", { precision: 12, scale: 2 }).default("0"),
  defaultAdminFeeEnabled: boolean("default_admin_fee_enabled").default(false),
  appointmentBufferMinutes: integer("appointment_buffer_minutes").default(15),
  calendarBlockCapacityPerSlot: integer("calendar_block_capacity_per_slot").default(1),
  leadCaptureEnabled: boolean("lead_capture_enabled").default(false),
  leadAutoResponseEnabled: boolean("lead_auto_response_enabled").default(true),
  leadAutoResponseEmailEnabled: boolean("lead_auto_response_email_enabled").default(true),
  leadAutoResponseSmsEnabled: boolean("lead_auto_response_sms_enabled").default(false),
  missedCallTextBackEnabled: boolean("missed_call_text_back_enabled").default(false),
  automationUncontactedLeadsEnabled: boolean("automation_uncontacted_leads_enabled").default(false),
  automationUncontactedLeadHours: integer("automation_uncontacted_lead_hours").default(2),
  automationAppointmentRemindersEnabled: boolean("automation_appointment_reminders_enabled").default(true),
  automationAppointmentReminderHours: integer("automation_appointment_reminder_hours").default(24),
  automationSendWindowStartHour: integer("automation_send_window_start_hour").default(8),
  automationSendWindowEndHour: integer("automation_send_window_end_hour").default(18),
  automationReviewRequestsEnabled: boolean("automation_review_requests_enabled").default(false),
  automationReviewRequestDelayHours: integer("automation_review_request_delay_hours").default(24),
  reviewRequestUrl: text("review_request_url"),
  automationLapsedClientsEnabled: boolean("automation_lapsed_clients_enabled").default(false),
  automationLapsedClientMonths: integer("automation_lapsed_client_months").default(6),
  bookingRequestUrl: text("booking_request_url"),
  integrationWebhookEnabled: boolean("integration_webhook_enabled").default(false),
  integrationWebhookUrl: text("integration_webhook_url"),
  integrationWebhookSecret: text("integration_webhook_secret"),
  integrationWebhookEvents: text("integration_webhook_events").default("[]"),
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
  stripeConnectAccountId: text("stripe_connect_account_id"),
  stripeConnectDetailsSubmitted: boolean("stripe_connect_details_submitted").default(false),
  stripeConnectChargesEnabled: boolean("stripe_connect_charges_enabled").default(false),
  stripeConnectPayoutsEnabled: boolean("stripe_connect_payouts_enabled").default(false),
  stripeConnectOnboardedAt: timestamp("stripe_connect_onboarded_at", { withTimezone: true }),
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

export const membershipPermissionGrants = pgTable(
  "membership_permission_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    permission: permissionEnum("permission").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("membership_permission_grants_business_user_permission_unique").on(t.businessId, t.userId, t.permission)]
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
  clientId: uuid("client_id").references(() => clients.id),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  assignedStaffId: uuid("assigned_staff_id").references(() => staff.id),
  locationId: uuid("location_id").references(() => locations.id),
  title: text("title"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  jobStartTime: timestamp("job_start_time", { withTimezone: true }),
  expectedCompletionTime: timestamp("expected_completion_time", { withTimezone: true }),
  pickupReadyTime: timestamp("pickup_ready_time", { withTimezone: true }),
  vehicleOnSite: boolean("vehicle_on_site").default(false),
  jobPhase: appointmentJobPhaseEnum("job_phase").default("scheduled").notNull(),
  status: appointmentStatusEnum("status").default("scheduled").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  applyTax: boolean("apply_tax").default(false),
  adminFeeRate: decimal("admin_fee_rate", { precision: 5, scale: 2 }).default("0"),
  adminFeeAmount: decimal("admin_fee_amount", { precision: 12, scale: 2 }).default("0"),
  applyAdminFee: boolean("apply_admin_fee").default(false),
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
  categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").default(0).notNull(),
  taxable: boolean("taxable").default(true),
  /** When true, service is intended as an add-on to another line item (still configurable). */
  isAddon: boolean("is_addon").default(false),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key"),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("service_categories_business_name_unique").on(t.businessId, t.name),
    uniqueIndex("service_categories_business_key_unique").on(t.businessId, t.key),
  ]
);

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
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  expenseDate: timestamp("expense_date", { withTimezone: true }).notNull(),
  vendor: text("vendor").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
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
  integrationJobId: uuid("integration_job_id"),
  channel: text("channel").notNull(),
  recipient: text("recipient").notNull(),
  subject: text("subject"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  providerMessageId: text("provider_message_id"),
  providerStatus: text("provider_status"),
  providerStatusAt: timestamp("provider_status_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  providerErrorCode: text("provider_error_code"),
  error: text("error"),
  metadata: text("metadata"),
  retryCount: integer("retry_count").default(0).notNull(),
  lastRetryAt: timestamp("last_retry_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("notification_logs_provider_message_unique").on(t.channel, t.providerMessageId),
]);

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

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    ownerType: integrationOwnerTypeEnum("owner_type").default("business").notNull(),
    ownerKey: text("owner_key").notNull(),
    status: integrationConnectionStatusEnum("status").default("pending").notNull(),
    displayName: text("display_name"),
    externalAccountId: text("external_account_id"),
    externalAccountName: text("external_account_name"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    encryptedConfig: text("encrypted_config"),
    scopes: text("scopes").default("[]").notNull(),
    featureEnabled: boolean("feature_enabled").default(true).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSuccessfulAt: timestamp("last_successful_at", { withTimezone: true }),
    lastError: text("last_error"),
    actionRequired: text("action_required"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("integration_connections_provider_owner_unique").on(t.businessId, t.provider, t.ownerKey)]
);

export const integrationSyncLinks = pgTable(
  "integration_sync_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    externalId: text("external_id").notNull(),
    externalSecondaryId: text("external_secondary_id"),
    fingerprint: text("fingerprint"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("integration_sync_links_connection_entity_unique").on(t.connectionId, t.entityType, t.entityId),
    uniqueIndex("integration_sync_links_connection_external_unique").on(t.connectionId, t.entityType, t.externalId),
  ]
);

export const integrationJobs = pgTable(
  "integration_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => integrationConnections.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    jobType: text("job_type").notNull(),
    payload: text("payload").default("{}").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: integrationJobStatusEnum("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).defaultNow().notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("integration_jobs_provider_type_idempotency_unique").on(t.businessId, t.provider, t.jobType, t.idempotencyKey)]
);

export const integrationJobAttempts = pgTable(
  "integration_job_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => integrationJobs.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: integrationJobStatusEnum("status").notNull(),
    requestSnapshot: text("request_snapshot"),
    responseSnapshot: text("response_snapshot"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("integration_job_attempts_job_attempt_unique").on(t.jobId, t.attemptNumber)]
);
