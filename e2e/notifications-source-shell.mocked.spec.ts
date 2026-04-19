import { expect, test, type Page, type Route } from "@playwright/test";

type MockNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type MockApiOptions = {
  appointment?: Record<string, unknown>;
  notifications?: MockNotification[];
  services?: Array<Record<string, unknown>>;
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

function createMockNotifications(): MockNotification[] {
  return [
    {
      id: "notif_booking",
      type: "new_booking_request",
      title: "New booking request",
      message: "Avery Cole requested ceramic coating.",
      entityType: "booking_request",
      entityId: "br_1",
      isRead: false,
      metadata: { notificationBucket: "leads", path: "/appointments/requests?request=br_1" },
      createdAt: "2026-04-18T16:00:00.000Z",
      updatedAt: "2026-04-18T16:00:00.000Z",
    },
    {
      id: "notif_lead",
      type: "new_lead",
      title: "Lead created",
      message: "A new lead was created from a booking request.",
      entityType: "client",
      entityId: "lead_1",
      isRead: false,
      metadata: { notificationBucket: "leads", path: "/clients/lead_1?from=%2Fleads" },
      createdAt: "2026-04-18T15:00:00.000Z",
      updatedAt: "2026-04-18T15:00:00.000Z",
    },
    {
      id: "notif_appt",
      type: "appointment_created",
      title: "Appointment created",
      message: "A booking request was converted into an appointment.",
      entityType: "appointment",
      entityId: "appt_source",
      isRead: false,
      metadata: { notificationBucket: "calendar", path: "/appointments/appt_source" },
      createdAt: "2026-04-18T14:00:00.000Z",
      updatedAt: "2026-04-18T14:00:00.000Z",
    },
    {
      id: "notif_payment",
      type: "payment_received",
      title: "Payment received",
      message: "Deposit cleared for a different appointment.",
      entityType: "payment",
      entityId: "payment_1",
      isRead: false,
      metadata: { notificationBucket: "other" },
      createdAt: "2026-04-18T13:00:00.000Z",
      updatedAt: "2026-04-18T13:00:00.000Z",
    },
  ];
}

function computeCounts(notifications: MockNotification[]) {
  return notifications.reduce(
    (accumulator, notification) => {
      if (notification.isRead) return accumulator;
      accumulator.total += 1;
      const bucket = notification.metadata.notificationBucket;
      if (bucket === "leads") accumulator.leads += 1;
      if (bucket === "calendar") accumulator.calendar += 1;
      return accumulator;
    },
    { total: 0, leads: 0, calendar: 0 }
  );
}

function createSourceLinkedAppointment() {
  return {
    id: "appt_source",
    title: "Ceramic Coating",
    status: "scheduled",
    startTime: "2026-04-26T16:00:00.000Z",
    endTime: "2026-04-26T18:30:00.000Z",
    jobStartTime: null,
    expectedCompletionTime: null,
    pickupReadyTime: null,
    vehicleOnSite: false,
    jobPhase: "scheduled",
    notes: "Original request preserved in the appointment notes.",
    internalNotes: "Gate code 9214. Customer prefers text updates.",
    isMobile: true,
    mobileAddress: "123 Palm St, Los Angeles, CA 90001",
    subtotal: 299,
    taxRate: 0,
    taxAmount: 0,
    applyTax: false,
    adminFeeRate: 0,
    adminFeeAmount: 0,
    depositAmount: 0,
    totalAmount: 299,
    total: 299,
    client: {
      id: "lead_1",
      firstName: "Avery",
      lastName: "Cole",
      phone: "555-000-1111",
      email: "avery@example.com",
    },
    vehicle: {
      id: "veh_1",
      year: 2022,
      make: "Toyota",
      model: "Camry",
      color: "Black",
      licensePlate: "8ABC123",
    },
    source: {
      type: "booking_request",
      label: "Booking Request",
      leadClientId: "lead_1",
      bookingRequestId: "br_1",
      href: "/appointments/requests?request=br_1",
      metadata: {
        requestedServices: "Ceramic coating, odor removal",
        sourceSummary: "Customer asked for next available Saturday morning.",
        leadSource: "Website form",
        requestedAddress: "123 Palm St, Los Angeles, CA 90001",
        customerName: "Avery Cole",
        customerPhone: "555-000-1111",
        customerEmail: "avery@example.com",
      },
    },
  };
}

async function installMockApi(page: Page, options: MockApiOptions = {}) {
  const state = {
    notifications: options.notifications ? options.notifications.map((notification) => ({ ...notification })) : [],
  };

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method().toUpperCase();

    if (pathname.endsWith("/api/auth/sign-in") && method === "POST") {
      return json(route, {
        data: {
          id: "user_owner",
          email: "owner@example.com",
          firstName: "Taylor",
          lastName: "Owner",
          token: "owner-token",
        },
      });
    }

    if (pathname.endsWith("/api/auth/me")) {
      return json(route, {
        data: {
          id: "user_owner",
          email: "owner@example.com",
          firstName: "Taylor",
          lastName: "Owner",
          token: "owner-token",
        },
      });
    }

    if (pathname.endsWith("/api/auth/context")) {
      return json(route, {
        data: {
          currentBusinessId: "biz_1",
          businesses: [
            {
              id: "biz_1",
              name: "Strata Detail Co.",
              type: "auto_detailing",
              role: "owner",
              status: "active",
              isDefault: true,
              permissions: [
                "appointments.read",
                "appointments.write",
                "customers.read",
                "customers.write",
                "settings.read",
              ],
            },
          ],
        },
      });
    }

    if (pathname.endsWith("/api/notifications/read-all") && method === "POST") {
      state.notifications = state.notifications.map((notification) => ({ ...notification, isRead: true }));
      return json(route, { ok: true });
    }

    const markReadMatch = pathname.match(/\/api\/notifications\/([^/]+)\/read$/);
    if (markReadMatch && method === "POST") {
      const notificationId = decodeURIComponent(markReadMatch[1] ?? "");
      state.notifications = state.notifications.map((notification) =>
        notification.id === notificationId ? { ...notification, isRead: true } : notification
      );
      return json(route, { ok: true, id: notificationId });
    }

    if (pathname.endsWith("/api/notifications/unread-count")) {
      return json(route, computeCounts(state.notifications));
    }

    if (pathname.endsWith("/api/notifications")) {
      return json(route, { records: state.notifications });
    }

    if (pathname.endsWith("/api/appointments/appt_source")) {
      return json(route, options.appointment ?? createSourceLinkedAppointment());
    }

    if (pathname.endsWith("/api/services")) {
      return json(route, { records: options.services ?? [] });
    }

    if (method === "GET") {
      return json(route, { records: [] });
    }

    return json(route, { ok: true });
  });
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await expect(page.locator("#email")).toBeVisible();
  await page.locator("#email").fill("owner@example.com");
  await page.locator("#password").fill("TestPassword123!");
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/signed-in/);
  await expect(page.getByRole("button", { name: /open notifications/i })).toBeVisible();
}

test("notification counts stay scoped and update without a full page reload", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("beforeUnloadCount", "0");
    window.addEventListener("beforeunload", () => {
      const current = Number(window.sessionStorage.getItem("beforeUnloadCount") ?? "0");
      window.sessionStorage.setItem("beforeUnloadCount", String(current + 1));
    });
  });

  await installMockApi(page, { notifications: createMockNotifications() });
  await signIn(page);

  await expect(page.getByRole("button", { name: /open notifications \(4 unread\)/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /leads \(2 unread\)/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /calendar \(1 unread\)/i })).toBeVisible();

  await page.getByRole("button", { name: /open notifications \(4 unread\)/i }).click();
  await expect(page.getByText("New booking request")).toBeVisible();

  await page.getByRole("button", { name: /^Read$/i }).first().click();
  await expect(page.getByRole("button", { name: /open notifications \(3 unread\)/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /leads \(1 unread\)/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /calendar \(1 unread\)/i })).toBeVisible();

  await page.getByRole("button", { name: /New booking request/i }).click();
  await page.waitForURL(/\/appointments\/requests\?request=br_1/);
  await expect(page.getByRole("button", { name: /open notifications \(3 unread\)/i })).toBeVisible();
  await expect(page.evaluate(() => window.sessionStorage.getItem("beforeUnloadCount"))).resolves.toBe("0");

  await page.getByRole("button", { name: /open notifications \(3 unread\)/i }).click();
  await expect(page.getByRole("button", { name: /mark all read/i })).toBeVisible();
  await page.getByRole("button", { name: /mark all read/i }).click({ force: true });
  await expect(page.getByRole("button", { name: /^open notifications$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Leads$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Calendar$/i }).first()).toBeVisible();
});

test("booking request source details stay visible in appointment creation and linked appointment UI", async ({ page }) => {
  await installMockApi(page, {
    appointment: createSourceLinkedAppointment(),
    services: [
      {
        id: "svc_unrelated",
        name: "Express Exterior Wash",
        category: "wash",
        price: 79,
        durationMinutes: 60,
        active: true,
      },
    ],
  });
  await signIn(page);

  const search = new URLSearchParams({
    sourceType: "booking_request",
    sourceBookingRequestId: "br_1",
    requestedServices: "Ceramic coating, odor removal",
    leadSource: "Website form",
    sourceSummary: "Customer asked for next available Saturday morning.",
    sourceAddress: "123 Palm St, Los Angeles, CA 90001",
    sourceCustomerName: "Avery Cole",
    sourcePhone: "555-000-1111",
    sourceEmail: "avery@example.com",
    notes: "Customer wants a low-odor option if possible.",
    internalNotes: "Gate code 9214.",
    vehicleYear: "2022",
    vehicleMake: "Toyota",
    vehicleModel: "Camry",
    vehicleColor: "Black",
    licensePlate: "8ABC123",
    mobile: "1",
    mobileAddress: "123 Palm St, Los Angeles, CA 90001",
  });

  await page.goto(`/appointments/new?${search.toString()}`);
  await expect(page.getByText("Created from Booking Request")).toBeVisible();
  await expect(page.getByText("Request ID: br_1")).toBeVisible();
  await expect(page.getByText("Customer asked for next available Saturday morning.")).toBeVisible();
  await expect(page.getByText("Requested: Ceramic coating, odor removal")).toBeVisible();
  await expect(page.getByText(/Contact:\s*Avery Cole/i)).toBeVisible();
  await expect(page.getByText("Lead source: Website form", { exact: true })).toBeVisible();
  await expect(page.getByText(/No exact catalog match is selected yet/i)).toBeVisible();

  await page.goto("/appointments/appt_source?from=%2Fappointments%2Frequests");
  await expect(page.getByText("Created from Booking Request", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Booking request ID: br_1")).toBeVisible();
  await expect(page.getByText("Requested work")).toBeVisible();
  await expect(page.getByText("Ceramic coating, odor removal")).toBeVisible();
  await expect(page.getByText("Lead source")).toBeVisible();
  await expect(page.getByText("Requested address")).toBeVisible();
  await expect(page.getByText("Captured contact")).toBeVisible();
  await expect(page.getByRole("link", { name: /open source/i })).toHaveAttribute(
    "href",
    "/appointments/requests?request=br_1"
  );
});

test.describe("mobile header shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile header keeps navigation and notifications usable without crowding", async ({ page }) => {
    await installMockApi(page, { notifications: [] });
    await signIn(page);

    const header = page.locator("header").first();
    const navButton = page.getByRole("button", { name: /open navigation menu/i });
    const notificationButton = page.getByRole("button", { name: /^open notifications$/i });

    await expect(header).toBeVisible();
    await expect(navButton).toBeVisible();
    await expect(notificationButton).toBeVisible();

    const headerBox = await header.boundingBox();
    const navBox = await navButton.boundingBox();
    const notificationBox = await notificationButton.boundingBox();

    expect(headerBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(notificationBox).not.toBeNull();

    expect(navBox!.x).toBeGreaterThanOrEqual(headerBox!.x);
    expect(notificationBox!.x + notificationBox!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width);
    expect(notificationBox!.x).toBeGreaterThan(navBox!.x + navBox!.width);

    await notificationButton.click();
    await expect(page.getByText("Notifications", { exact: true })).toBeVisible();

    const popover = page.locator("[data-radix-popper-content-wrapper]").last();
    const popoverBox = await popover.boundingBox();

    expect(popoverBox).not.toBeNull();
    expect(popoverBox!.x).toBeGreaterThanOrEqual(0);
    expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(390);
  });
});
