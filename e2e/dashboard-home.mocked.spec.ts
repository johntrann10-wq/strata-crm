import { expect, test } from "@playwright/test";

type MockRole = "owner" | "manager" | "technician";
type DashboardMode = "normal" | "empty" | "edge";
type DashboardRange = "today" | "week" | "month";

function permissionsForRole(role: MockRole) {
  if (role === "technician") {
    return ["dashboard.view", "customers.read", "vehicles.read", "appointments.read", "jobs.read", "jobs.write", "quotes.read", "invoices.read"];
  }
  if (role === "manager") {
    return [
      "dashboard.view",
      "customers.read",
      "customers.write",
      "vehicles.read",
      "vehicles.write",
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
    ];
  }
  return [
    "dashboard.view",
    "customers.read",
    "customers.write",
    "vehicles.read",
    "vehicles.write",
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
  ];
}

function widgetOrder(role: MockRole) {
  if (role === "technician") return ["summary_today", "summary_needs_action", "today_schedule", "action_queue", "quick_actions", "recent_activity"];
  if (role === "manager") return ["summary_needs_action", "summary_today", "summary_cash", "today_schedule", "action_queue", "quick_actions", "revenue_collections", "recent_activity", "pipeline", "business_health"];
  return ["summary_needs_action", "summary_today", "summary_cash", "summary_conversion", "today_schedule", "action_queue", "quick_actions", "pipeline", "revenue_collections", "recent_activity", "automations", "business_health", "goals"];
}

function hiddenWidgets(role: MockRole) {
  if (role === "technician") return ["summary_cash", "summary_conversion", "pipeline", "revenue_collections", "automations", "business_health", "goals"];
  if (role === "manager") return ["summary_conversion", "automations", "goals"];
  return [];
}

function quickActions(role: MockRole) {
  if (role === "technician") {
    return [];
  }
  const actions = [
    { key: "new_appointment", label: "New appointment", description: "Book the next job without leaving the dashboard.", url: "/appointments/new", permission: "appointments.write" },
    { key: "new_quote", label: "New quote", description: "Send pricing while the lead is still warm.", url: "/quotes/new", permission: "quotes.write" },
    { key: "new_invoice", label: "New invoice", description: "Bill completed work right away.", url: "/invoices/new", permission: "invoices.write" },
    { key: "add_client", label: "Add client", description: "Create a customer record fast.", url: "/clients/new", permission: "customers.write" },
    { key: "add_vehicle", label: "Add vehicle", description: "Attach a vehicle before booking work.", url: "/vehicles/new", permission: "vehicles.write" },
    { key: "collect_payment", label: "Collect payment", description: "Open unpaid invoices that need cash now.", url: "/invoices", permission: "payments.write" },
    { key: "send_reminder", label: "Send reminder", description: "Catch customers before they miss their slot.", url: "/appointments", permission: "appointments.read" },
  ];
  return role === "manager" ? actions.filter((action) => action.key !== "add_vehicle") : actions;
}

function queueItems(mode: DashboardMode) {
  if (mode === "empty") return [];
  if (mode === "edge") {
    return [
      { id: "invoice:1", type: "overdue_invoice", label: "Collect invoice 1024", reason: "Invoice is 6 days overdue and still has a remaining balance.", urgency: "critical", amountAtRisk: 1840, ctaLabel: "Open invoice", ctaUrl: "/invoices/inv-1024", supportsSnooze: true, supportsDismiss: true, occurredAt: "2026-04-09T18:00:00.000Z", priority: 990, priorityReasons: ["urgency", "money_at_risk", "aging"] },
      { id: "deposit:1", type: "deposit_due", label: "Collect Jacob's deposit", reason: "Tomorrow's ceramic coating still needs a required deposit.", urgency: "high", amountAtRisk: 200, ctaLabel: "Open appointment", ctaUrl: "/appointments/appt-1", supportsSnooze: true, supportsDismiss: true, occurredAt: "2026-04-10T12:00:00.000Z", priority: 900, priorityReasons: ["appointment_imminence", "money_at_risk"] },
      { id: "lead:1", type: "uncontacted_lead", label: "Respond to new lead", reason: "A new tint lead has been waiting past the first-response SLA.", urgency: "high", amountAtRisk: null, ctaLabel: "Open lead", ctaUrl: "/leads", supportsSnooze: true, supportsDismiss: true, occurredAt: "2026-04-10T11:15:00.000Z", priority: 870, priorityReasons: ["sla_breach", "staleness"] },
    ];
  }
  return [
    { id: "deposit:1", type: "deposit_due", label: "Collect Jacob's deposit", reason: "Tomorrow's ceramic coating still needs a required deposit.", urgency: "high", amountAtRisk: 200, ctaLabel: "Open appointment", ctaUrl: "/appointments/appt-1", supportsSnooze: true, supportsDismiss: true, occurredAt: "2026-04-10T12:00:00.000Z", priority: 900, priorityReasons: ["appointment_imminence", "money_at_risk"] },
    { id: "quote:1", type: "quote_follow_up", label: "Follow up on quote 204", reason: "The quote was sent yesterday and still needs a follow-up.", urgency: "medium", amountAtRisk: 695, ctaLabel: "Open quote", ctaUrl: "/quotes/quote-204", supportsSnooze: true, supportsDismiss: true, occurredAt: "2026-04-09T17:00:00.000Z", priority: 730, priorityReasons: ["aging"] },
  ];
}

function buildSnapshot(role: MockRole, mode: DashboardMode, range: DashboardRange, teamMemberId: string | null, state: { featureEnabled: boolean; widgetErrors: Record<string, { message: string; retryable: boolean }>; preferences: any; }) {
  const modulePermissions = {
    today: true,
    cash: role !== "technician",
    conversion: role !== "technician",
    todaySchedule: true,
    actionQueue: true,
    pipeline: role !== "technician",
    revenueCollections: role !== "technician",
    recentActivity: true,
    automations: role === "owner",
    businessHealth: role !== "technician",
    goals: role === "owner",
    teamVisibility: role !== "technician",
    clientVisibility: true,
    vehicleVisibility: true,
    quoteVisibility: true,
    invoiceVisibility: true,
    paymentVisibility: role !== "technician",
    settingsVisibility: role !== "technician",
  };
  const visibleQueue = queueItems(mode).filter((item) => !state.preferences.dismissedQueueItems[item.id] && !state.preferences.snoozedQueueItems[item.id]);
  const breakdown = visibleQueue.reduce<Record<string, number>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, { uncontacted_lead: 0, quote_follow_up: 0, deposit_due: 0, overdue_invoice: 0, completed_missing_invoice: 0, review_request: 0, reactivation: 0, system_issue: 0 });
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    businessId: "biz-1",
    timezone: "America/Los_Angeles",
    featureFlags: { homeDashboardV2: state.featureEnabled },
    context: { role, timeOfDay: "morning" },
    filters: { range, teamMemberId },
    preferences: state.preferences,
    cache: { key: `dashboard:${role}:${range}:${teamMemberId ?? "all"}`, tags: ["business:biz-1", "dashboard:biz-1", "dashboard:biz-1:user-1"], hit: false, staleAt: new Date(Date.now() + 30000).toISOString() },
    degraded: Object.keys(state.widgetErrors).length > 0,
    widgetErrors: state.widgetErrors,
    modulePermissions,
    summaryCards: {
      needsAction: { allowed: true, total: visibleQueue.length, breakdown },
      today: { allowed: true, jobs: mode === "empty" ? 0 : 4, dropoffs: mode === "empty" ? 0 : 2, pickups: mode === "empty" ? 0 : 1, inShop: mode === "empty" ? 0 : 2 },
      cash: { allowed: modulePermissions.cash, collectedToday: modulePermissions.cash ? (mode === "edge" ? 420 : 980) : 0, outstandingInvoiceAmount: modulePermissions.cash ? (mode === "edge" ? 2440 : 920) : 0, overdueInvoiceAmount: modulePermissions.cash ? (mode === "edge" ? 1840 : 0) : 0, depositsDueAmount: modulePermissions.cash ? (mode === "edge" ? 350 : 200) : 0 },
      conversion: { allowed: modulePermissions.conversion, newLeads: mode === "empty" ? 0 : mode === "edge" ? 5 : 3, quoted: mode === "empty" ? 0 : 4, booked: mode === "empty" ? 0 : 3, conversionRate: mode === "empty" ? null : 60 },
    },
    todaySchedule: {
      allowed: true,
      items: mode === "empty" ? [] : [{
        id: "sched-1", appointmentId: "appt-1", title: "5-Year Ceramic Coating", status: "confirmed", phase: "scheduled", startTime: "2026-04-10T16:00:00.000Z", endTime: "2026-04-10T19:00:00.000Z", overlapKind: "same_day",
        client: { id: "client-1", name: "Jacob Wheelihan", url: "/clients/client-1" }, vehicle: { id: "vehicle-1", label: "2022 Tesla Model Y", url: "/vehicles/vehicle-1" }, assignedTeam: [{ id: "staff-1", name: "Alex Detailer" }],
        servicesSummary: { label: "Ceramic coating · 1 service", count: 1, names: ["5-Year Ceramic Coating"] },
        financeBadges: mode === "edge" ? [{ key: "deposit_due", label: "Deposit due", tone: "warning" }, { key: "balance_due", label: "Balance due", tone: "muted" }] : [{ key: "deposit_collected", label: "Deposit collected", tone: "success" }],
        urls: { appointment: "/appointments/appt-1", schedule: "/appointments", client: "/clients/client-1", vehicle: "/vehicles/vehicle-1" },
        inlineActions: [{ key: "open", label: "Open appointment", url: "/appointments/appt-1" }, { key: "collect_payment", label: "Collect payment", url: "/appointments/appt-1?collect=1" }, { key: "view_client", label: "Client", url: "/clients/client-1" }],
      }],
    },
    actionQueue: { allowed: true, items: visibleQueue },
    quickActions: quickActions(role),
    pipeline: { allowed: modulePermissions.pipeline, stages: mode === "empty" || !modulePermissions.pipeline ? [] : [{ key: "new_leads", label: "New leads", count: mode === "edge" ? 3 : 2, value: null }, { key: "quoted", label: "Quoted", count: 4, value: 2780 }, { key: "booked", label: "Booked", count: 6, value: 4830 }, { key: "completed", label: "Completed", count: 3, value: 1895 }, { key: "paid", label: "Paid", count: 9, value: 6420 }] },
    revenueCollections: { allowed: modulePermissions.revenueCollections, bookedRevenueThisWeek: modulePermissions.revenueCollections ? 4230 : 0, collectedThisWeek: modulePermissions.revenueCollections ? 2180 : 0, collectedToday: modulePermissions.revenueCollections ? 980 : 0, outstandingInvoiceAmount: modulePermissions.revenueCollections ? (mode === "edge" ? 2440 : 920) : 0, overdueInvoiceAmount: modulePermissions.revenueCollections ? (mode === "edge" ? 1840 : 0) : 0, depositsDueAmount: modulePermissions.revenueCollections ? (mode === "edge" ? 350 : 200) : 0, depositsDueCount: modulePermissions.revenueCollections ? (mode === "edge" ? 2 : 1) : 0 },
    recentActivity: { allowed: true, items: mode === "empty" ? [] : [{ id: "activity-1", type: "appointment_created", label: "New ceramic coating booked", detail: "Jacob Wheelihan · 2022 Tesla Model Y", occurredAt: "2026-04-10T15:30:00.000Z", entityType: "appointment", entityId: "appt-1", url: "/appointments/appt-1" }, { id: "activity-2", type: "payment_received", label: "Payment received on invoice 1022", detail: "Collected $715.85", occurredAt: "2026-04-10T14:00:00.000Z", entityType: "invoice", entityId: "inv-1022", url: "/invoices/inv-1022" }] },
    automations: { allowed: modulePermissions.automations, remindersSentThisWeek: modulePermissions.automations ? 12 : 0, invoiceNudgesSentThisWeek: modulePermissions.automations ? 4 : null, reviewRequestsSentThisWeek: modulePermissions.automations ? 6 : 0, reactivationMessagesSentThisWeek: modulePermissions.automations ? 2 : 0, deliverySuccessRate: modulePermissions.automations ? 96 : null, failedAutomationCount: modulePermissions.automations ? (mode === "edge" ? 1 : 0) : 0 },
    valueMoments: mode === "empty" ? [] : [{ id: "value-1", label: "Strata sent 12 reminders this week", detail: "Appointment reminders are still taking work off the phones.", url: "/settings?tab=automations" }, { id: "value-2", label: "$1,840 overdue balance still needs attention", detail: "That is the biggest cash item the shop can act on right now.", url: "/invoices" }],
    nudges: mode === "empty" ? [{ id: "nudge-goal", label: "Set a monthly goal", detail: "Goals turn the dashboard into a pace tracker instead of a static screen.", url: "/settings?tab=business", tone: "info" }] : mode === "edge" ? [{ id: "nudge-stripe", label: "Connect Stripe for faster deposit collection", detail: "Deposits are due on upcoming work and online payment setup is incomplete.", url: "/settings?tab=payments", tone: "warning" }] : [],
    sinceLastChecked: { allowed: true, since: "2026-04-10T12:00:00.000Z", newLeads: mode === "empty" ? 0 : 3, newBookings: mode === "empty" ? 0 : 2, paymentsReceived: mode === "empty" ? 0 : 1, newIssues: mode === "edge" ? 2 : 0, resolvedIssues: mode === "empty" ? 0 : 1 },
    businessHealth: { allowed: modulePermissions.businessHealth, score: modulePermissions.businessHealth ? (mode === "edge" ? 68 : 89) : null, factors: modulePermissions.businessHealth ? [{ key: "overdue_invoices", label: "Overdue invoices", score: mode === "edge" ? 42 : 88, weight: 0.25, detail: "Older unpaid invoices are slowing cash collection.", issueCount: mode === "edge" ? 3 : 0 }, { key: "missing_deposits", label: "Missing deposits", score: mode === "edge" ? 55 : 94, weight: 0.2, detail: "Upcoming appointments still need deposit collection.", issueCount: mode === "edge" ? 2 : 1 }, { key: "lead_response", label: "Lead response", score: mode === "edge" ? 63 : 91, weight: 0.2, detail: "A few leads are drifting past the first-touch SLA.", issueCount: mode === "edge" ? 3 : 0 }] : [], topIssues: modulePermissions.businessHealth ? [{ label: "Clean up overdue invoices first", detail: "It is the fastest path to reduce cash pressure today.", url: "/invoices" }] : [] },
    goals: { allowed: modulePermissions.goals, monthlyRevenueGoal: modulePermissions.goals ? 15000 : null, currentRevenue: modulePermissions.goals ? 11700 : 0, percentToGoal: modulePermissions.goals ? 78 : null, projectedMonthEnd: modulePermissions.goals ? 16200 : null, monthlyJobsGoal: modulePermissions.goals ? 24 : null, currentJobs: modulePermissions.goals ? 19 : 0 },
    definitions: { weekStartsOn: "sunday", uncontactedLead: "Lead created more than 15 minutes ago with no first response.", quoteFollowUp: "Sent quote older than 24 hours without acceptance or decline.", depositDue: "Appointment in the next 48 hours with required deposit unpaid.", overdueInvoice: "Unpaid invoice past due date.", completedMissingInvoice: "Completed appointment without a linked invoice.", todayJobs: "Appointments that start today or overlap today.", cashCollectedToday: "Successful payments created today.", bookedRevenueThisWeek: "Value of newly booked appointments and standalone invoices this week." },
  };
}

async function mockDashboard(page: import("@playwright/test").Page, options?: { role?: MockRole; mode?: DashboardMode; featureEnabled?: boolean; widgetErrors?: Record<string, { message: string; retryable: boolean }>; }) {
  const role = options?.role ?? "owner";
  const state = {
    role,
    mode: options?.mode ?? "normal",
    featureEnabled: options?.featureEnabled ?? true,
    widgetErrors: options?.widgetErrors ?? {},
    snapshotCalls: 0,
    preferences: { widgetOrder: widgetOrder(role), hiddenWidgets: hiddenWidgets(role), defaultRange: "today", defaultTeamMemberId: role === "technician" ? null : "staff-1", dismissedQueueItems: {} as Record<string, string>, snoozedQueueItems: {} as Record<string, string>, lastSeenAt: "2026-04-10T12:00:00.000Z", updatedAt: "2026-04-10T12:00:00.000Z" },
  };

  await page.addInitScript(() => {
    window.localStorage.setItem("authToken", "dashboard-test-token");
    window.localStorage.setItem("currentBusinessId", "biz-1");
  });

  await page.route("**/api/auth/me", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "user-1", email: `${role}@example.com`, firstName: role[0]?.toUpperCase() + role.slice(1), lastName: "User", token: "dashboard-test-token", googleProfileId: null, hasPassword: true } }) }));
  await page.route("**/api/auth/context", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { businesses: [{ id: "biz-1", name: "Strata Detail Lab", type: "auto_detailing", role, status: "active", isDefault: true, permissions: permissionsForRole(role) }], currentBusinessId: "biz-1" } }) }));
  await page.route("**/api/businesses**", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "biz-1", name: "Strata Detail Lab", type: "auto_detailing", onboardingComplete: true }]) }));
  await page.route("**/api/users/user-1", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "user-1", email: `${role}@example.com`, firstName: role[0]?.toUpperCase() + role.slice(1), lastName: "User", googleProfileId: null }) }));
  await page.route("**/api/billing/status", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", active: true, subscriptionStatus: "active", planName: "Pro", billingRequired: false }) }));
  await page.route("**/api/staff**", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "staff-1", userId: "user-1", firstName: "Alex", lastName: "Detailer" }, { id: "staff-2", userId: "user-2", firstName: "Mia", lastName: "Porter" }]) }));
  await page.route("**/api/locations**", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }));
  await page.route("**/api/auth/sign-out", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));

  await page.route("**/api/actions/getHomeDashboard", async (route) => {
    state.snapshotCalls += 1;
    const body = (route.request().postDataJSON() ?? {}) as { range?: DashboardRange; teamMemberId?: string | null };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildSnapshot(role, state.mode, body.range ?? "today", body.teamMemberId ?? null, state)),
    });
  });

  await page.route("**/api/actions/updateHomeDashboardPreferences", async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { dismissQueueItemId?: string; snoozeQueueItemId?: string; snoozeUntil?: string; markSeenAt?: string; widgetOrder?: string[]; hiddenWidgets?: string[] };
    if (body.dismissQueueItemId) state.preferences.dismissedQueueItems[body.dismissQueueItemId] = new Date().toISOString();
    if (body.snoozeQueueItemId && body.snoozeUntil) state.preferences.snoozedQueueItems[body.snoozeQueueItemId] = body.snoozeUntil;
    if (body.markSeenAt) state.preferences.lastSeenAt = body.markSeenAt;
    if (body.widgetOrder) state.preferences.widgetOrder = body.widgetOrder;
    if (body.hiddenWidgets) state.preferences.hiddenWidgets = body.hiddenWidgets;
    state.preferences.updatedAt = new Date().toISOString();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences: state.preferences }) });
  });

  return state;
}

test.describe("Dashboard home (mocked)", () => {
  test("renders the owner control tower, preserves filters, and keeps drill-downs obvious", async ({ page }) => {
    await mockDashboard(page, { role: "owner", mode: "normal" });
    await page.goto("/signed-in");
    const main = page.locator("main");
    await expect(main.getByText("Needs Action", { exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: /^dashboard$/i })).toBeVisible();
    await expect(main.getByText("Today Schedule", { exact: true })).toBeVisible();
    await expect(main.getByText("Action Queue", { exact: true })).toBeVisible();
    await expect(main.getByText("Revenue + Collections", { exact: true })).toBeVisible();
    await expect(main.getByText("Automations", { exact: true })).toBeVisible();
    await expect(main.getByText("Goals", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Filter dashboard by team member")).toBeVisible();
    await page.getByRole("button", { name: /this week/i }).click();
    await expect(page).toHaveURL(/range=week/);
    await expect(main.getByText("This Week", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /new appointment/i }).first()).toHaveAttribute("href", "/appointments/new");
    await expect(page.getByRole("link", { name: /open appointment/i }).first()).toHaveAttribute("href", "/appointments/appt-1");
    if (process.platform === "win32") {
      await expect(page.locator("main")).toHaveScreenshot("dashboard-owner-control-tower.png", {
        animations: "disabled",
        mask: [page.getByText(/Last updated/i)],
      });
    }
  });

  test("shows manager-focused defaults without leaking owner-only controls", async ({ page }) => {
    await mockDashboard(page, { role: "manager", mode: "normal" });
    await page.goto("/signed-in");
    await expect(page.getByText("Manager view")).toBeVisible();
    await expect(page.getByText("Today Schedule", { exact: true })).toBeVisible();
    await expect(page.getByText("Action Queue", { exact: true })).toBeVisible();
    await expect(page.getByText("Goals", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /customize/i })).toBeVisible();
  });

  test.describe("mobile technician view", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("stays usable on mobile and keeps the technician focused on work", async ({ page }) => {
      await mockDashboard(page, { role: "technician", mode: "normal" });
      await page.goto("/signed-in");
      const main = page.locator("main");
      await expect(page.getByText("Technician view")).toBeVisible();
      await expect(page.getByLabel("Filter dashboard by team member")).toHaveCount(0);
      await expect(main.getByText("Today Schedule", { exact: true })).toBeVisible();
      await expect(main.getByText("Action Queue", { exact: true })).toBeVisible();
      await expect(main.getByText("Quick Actions", { exact: true })).toBeVisible();
      await expect(main.getByText("Automations", { exact: true })).toHaveCount(0);
      await expect(main.getByText("No quick actions available")).toBeVisible();
    });
  });

  test("renders useful empty states for a fresh business", async ({ page }) => {
    await mockDashboard(page, { role: "owner", mode: "empty" });
    await page.goto("/signed-in");
    await expect(page.getByText("Nothing scheduled in this view")).toBeVisible();
    await expect(page.getByText("No urgent queue items")).toBeVisible();
    await expect(page.getByText("No pipeline data yet")).toBeVisible();
    await expect(page.getByText("No activity yet")).toBeVisible();
    await expect(page.getByText("Set a monthly goal")).toBeVisible();
  });

  test("handles edge-case pressure, last-seen changes, and queue mutations with a refetch", async ({ page }) => {
    const state = await mockDashboard(page, { role: "owner", mode: "edge" });
    await page.goto("/signed-in");
    const queueCard = page.locator("#action-queue");
    await expect(queueCard.getByText("Collect invoice 1024")).toBeVisible();
    await expect(queueCard.getByText("$1,840 at risk")).toBeVisible();
    await expect(page.getByText("Since you last checked")).toBeVisible();
    await expect(page.getByText("Strata sent 12 reminders this week")).toBeVisible();
    await expect(page.getByText("Connect Stripe for faster deposit collection")).toBeVisible();
    const beforeDismiss = state.snapshotCalls;
    await queueCard.getByRole("button", { name: /^dismiss$/i }).first().click();
    await expect(queueCard.getByText("Collect invoice 1024")).toHaveCount(0);
    expect(state.snapshotCalls).toBeGreaterThan(beforeDismiss);
    const beforeSnooze = state.snapshotCalls;
    await queueCard.getByRole("button", { name: /^snooze$/i }).first().click();
    await expect(queueCard.getByText("Collect Jacob's deposit")).toHaveCount(0);
    expect(state.snapshotCalls).toBeGreaterThan(beforeSnooze);
  });

  test("keeps the rest of the dashboard usable when a single widget degrades", async ({ page }) => {
    await mockDashboard(page, { role: "owner", mode: "normal", widgetErrors: { quick_actions: { message: "Quick actions are temporarily unavailable.", retryable: true } } });
    await page.goto("/signed-in");
    await expect(page.getByText("Quick actions are temporarily unavailable.")).toBeVisible();
    await expect(page.getByText("Needs retry")).toBeVisible();
    await expect(page.getByText("Today Schedule", { exact: true })).toBeVisible();
    await expect(page.getByText("Action Queue", { exact: true })).toBeVisible();
  });

  test("respects the dashboard feature flag rollback path", async ({ page }) => {
    await mockDashboard(page, { role: "owner", mode: "normal", featureEnabled: false });
    await page.goto("/signed-in");
    await expect(page.getByText("Stable dashboard mode")).toBeVisible();
    await expect(page.getByRole("button", { name: /customize/i })).toHaveCount(0);
  });
});
