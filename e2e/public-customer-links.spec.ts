import { expect, test, type Page } from "@playwright/test";

function json(body: unknown) {
  return JSON.stringify(body);
}

function buildPublicPage({
  title,
  eyebrow,
  content,
  cta,
}: {
  title: string;
  eyebrow: string;
  content: string;
  cta?: { href: string; label: string };
}) {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
      <style>
        body { margin: 0; font-family: Inter, Arial, sans-serif; background: #f5f7fb; color: #0f172a; }
        main { max-width: 760px; margin: 40px auto; padding: 32px; background: white; border-radius: 24px; box-shadow: 0 24px 64px rgba(15, 23, 42, 0.12); }
        .eyebrow { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #f06419; margin-bottom: 12px; }
        h1 { margin: 0 0 12px; font-size: 34px; line-height: 1.05; }
        p { font-size: 16px; line-height: 1.6; color: #475569; }
        .card { margin-top: 24px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 18px; background: #f8fafc; }
        .cta { display: inline-block; margin-top: 20px; padding: 12px 18px; border-radius: 999px; background: #0f172a; color: white; text-decoration: none; font-weight: 600; }
        label { display: block; margin-top: 20px; margin-bottom: 8px; font-weight: 600; color: #0f172a; }
        textarea { width: 100%; min-height: 120px; padding: 14px; border: 1px solid #cbd5e1; border-radius: 16px; font: inherit; }
        button { margin-top: 16px; padding: 12px 18px; border: 0; border-radius: 999px; background: #f06419; color: white; font-weight: 700; font: inherit; cursor: pointer; }
      </style>
    </head>
    <body>
      <main>
        <div class="eyebrow">${eyebrow}</div>
        <h1>${title}</h1>
        ${content}
        ${cta ? `<a class="cta" href="${cta.href}">${cta.label}</a>` : ""}
      </main>
    </body>
  </html>`;
}

async function mockPublicAuthNoise(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: json({ message: "Not signed in" }) });
  });
  await page.route("**/api/auth/context", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: json({ message: "Not signed in" }) });
  });
  await page.route("**/api/health", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json({ ok: true }) });
  });
}

test.describe.configure({ mode: "serial" });

test.describe("Public customer links", () => {
  test("customer hub renders safely and public actions stay customer-facing", async ({ page }) => {
    test.setTimeout(120000);

    let revisionRequestMessage = "";

    await mockPublicAuthNoise(page);

    await page.route("**/api/portal/portal-valid", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: json({
          business: {
            name: "Coastline Detail Co.",
            email: "hello@coastlinedetail.co",
            phone: "(555) 111-2222",
          },
          client: {
            firstName: "Avery",
            lastName: "Detail",
            email: "avery@example.com",
            phone: "(555) 333-4444",
          },
          currentDocument: {
            kind: "quote",
            id: "quote-valid",
            title: "Estimate",
            status: "sent",
            url: "/api/quotes/quote-valid/public-html?token=quote-valid-token",
          },
          portalUrl: "/portal/portal-valid",
          sections: {
            quotes: [
              {
                id: "quote-valid",
                status: "sent",
                total: 899,
                expiresAt: "2026-04-21T08:00:00.000Z",
                createdAt: "2026-04-07T08:00:00.000Z",
                vehicleLabel: "2024 BMW M3 Competition",
                url: "/api/quotes/quote-valid/public-html?token=quote-valid-token",
              },
            ],
            invoices: [
              {
                id: "invoice-valid",
                invoiceNumber: "INV-2007",
                status: "sent",
                total: 425,
                balance: 125,
                dueDate: "2026-04-20T08:00:00.000Z",
                createdAt: "2026-04-10T08:00:00.000Z",
                url: "/api/invoices/invoice-valid/public-html?token=invoice-valid-token",
                payUrl: "/api/invoices/invoice-valid/public-pay?token=invoice-valid-token",
              },
            ],
            upcomingAppointments: [
              {
                id: "appointment-valid",
                title: "Ceramic maintenance visit",
                status: "confirmed",
                startTime: "2026-04-18T17:00:00.000Z",
                totalPrice: 310,
                depositAmount: 80,
                balanceDue: 230,
                paidInFull: false,
                depositSatisfied: false,
                vehicleLabel: "2024 BMW M3 Competition",
                url: "/api/appointments/appointment-valid/public-html?token=appointment-valid-token",
                payUrl: "/api/appointments/appointment-valid/public-pay?token=appointment-valid-token",
              },
            ],
            recentAppointments: [],
            vehicles: [
              {
                id: "vehicle-1",
                label: "2024 BMW M3 Competition",
                color: "Black Sapphire",
                licensePlate: "DETAIL1",
              },
            ],
          },
        }),
      });
    });

    await page.route("**/api/quotes/quote-valid/public-html?token=quote-valid-token", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: buildPublicPage({
          eyebrow: "Estimate",
          title: "Estimate for Avery Detail",
          content: `
            <p>Review the recommended work, confirm the vehicle, and request any changes directly from this page.</p>
            <div class="card">
              <strong>2024 BMW M3 Competition</strong>
              <p>Full ceramic refresh • $899.00</p>
            </div>
            <form method="post" action="/api/quotes/quote-valid/public-request-revision?token=quote-valid-token">
              <label for="message">What would you like changed?</label>
              <textarea id="message" name="message"></textarea>
              <button type="submit">Request changes</button>
            </form>
          `,
        }),
      });
    });

    await page.route("**/api/quotes/quote-valid/public-request-revision?token=quote-valid-token", async (route) => {
      revisionRequestMessage = new URLSearchParams(String(route.request().postData() ?? "")).get("message") ?? "";
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: buildPublicPage({
          eyebrow: "Estimate update",
          title: "Revision request sent",
          content: "<p>Coastline Detail Co. received your requested changes and will follow up shortly.</p>",
        }),
      });
    });

    await page.route("**/api/invoices/invoice-valid/public-html?token=invoice-valid-token", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: buildPublicPage({
          eyebrow: "Invoice",
          title: "Invoice #INV-2007",
          content: `
            <p>This page shows the open balance, due date, and payment options for your visit.</p>
            <div class="card">
              <strong>Balance due</strong>
              <p>$125.00 due by Apr 20, 2026</p>
            </div>
          `,
          cta: {
            href: "/api/invoices/invoice-valid/public-pay?token=invoice-valid-token",
            label: "Pay invoice",
          },
        }),
      });
    });

    await page.route("**/api/invoices/invoice-valid/public-pay?token=invoice-valid-token", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: buildPublicPage({
          eyebrow: "Secure payment",
          title: "Secure payment checkout",
          content: "<p>You are in the customer payment flow for Invoice #INV-2007. No admin or shop settings are exposed here.</p>",
        }),
      });
    });

    await page.route("**/api/appointments/appointment-valid/public-html?token=appointment-valid-token", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: buildPublicPage({
          eyebrow: "Appointment",
          title: "Ceramic maintenance visit",
          content: `
            <p>Review your appointment time, vehicle details, and deposit status before the visit.</p>
            <div class="card">
              <strong>Fri, Apr 18 at 10:00 AM</strong>
              <p>Deposit requested: $80.00</p>
            </div>
          `,
          cta: {
            href: "/api/appointments/appointment-valid/public-pay?token=appointment-valid-token",
            label: "Pay deposit",
          },
        }),
      });
    });

    await page.route("**/api/appointments/appointment-valid/public-pay?token=appointment-valid-token", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: buildPublicPage({
          eyebrow: "Secure deposit",
          title: "Secure deposit checkout",
          content: "<p>You are in the customer deposit flow for the upcoming appointment.</p>",
        }),
      });
    });

    await page.goto("/portal/portal-valid");

    await expect(page.getByText(/customer hub/i).first()).toBeVisible();
    await expect(page.getByText(/coastline detail co\./i).first()).toBeVisible();
    await expect(page.getByText(/has everything in one place now/i)).toBeVisible();
    await expect(page.getByText(/review your current estimate, unpaid invoices, appointments, and vehicle details/i)).toBeVisible();
    await expect(page.getByText(/avery detail/i)).toBeVisible();
    await expect(page.getByText(/2024 bmw m3 competition/i).first()).toBeVisible();
    await expect(page.getByText(/dashboard/i)).toHaveCount(0);
    await expect(page.getByText(/billing settings/i)).toHaveCount(0);
    await expect(page.getByText(/archive client/i)).toHaveCount(0);

    await page.getByRole("link", { name: /view estimate/i }).click();
    await expect(page).toHaveURL(/\/api\/quotes\/quote-valid\/public-html/);
    await expect(page.getByRole("heading", { name: /estimate for avery detail/i })).toBeVisible();
    await expect(page.getByText(/review the recommended work/i)).toBeVisible();
    await expect(page.getByText(/dashboard/i)).toHaveCount(0);
    await page.getByLabel(/what would you like changed\?/i).fill("Please add interior glass cleanup.");
    await page.getByRole("button", { name: /request changes/i }).click();
    await expect(page.getByRole("heading", { name: /revision request sent/i })).toBeVisible();
    expect(revisionRequestMessage).toContain("Please add interior glass cleanup.");

    await page.goto("/portal/portal-valid");
    await page.getByRole("link", { name: /view invoice/i }).click();
    await expect(page).toHaveURL(/\/api\/invoices\/invoice-valid\/public-html/);
    await expect(page.getByRole("heading", { name: /invoice #inv-2007/i })).toBeVisible();
    await page.getByRole("link", { name: /pay invoice/i }).click();
    await expect(page).toHaveURL(/\/api\/invoices\/invoice-valid\/public-pay/);
    await expect(page.getByRole("heading", { name: /secure payment checkout/i })).toBeVisible();
    await expect(page.getByText(/no admin or shop settings are exposed here/i)).toBeVisible();
    await expect(page.getByText(/team access/i)).toHaveCount(0);

    await page.goto("/portal/portal-valid");
    await page.getByRole("link", { name: /view appointment/i }).click();
    await expect(page).toHaveURL(/\/api\/appointments\/appointment-valid\/public-html/);
    await expect(page.getByRole("heading", { name: /ceramic maintenance visit/i })).toBeVisible();
    await page.getByRole("link", { name: /pay deposit/i }).click();
    await expect(page).toHaveURL(/\/api\/appointments\/appointment-valid\/public-pay/);
    await expect(page.getByRole("heading", { name: /secure deposit checkout/i })).toBeVisible();
    await expect(page.getByText(/customer deposit flow/i)).toBeVisible();
    await expect(page.getByText(/dashboard/i)).toHaveCount(0);
  });

  test("expired, revoked, invalid, and manipulated public links fail cleanly", async ({ page }) => {
    await mockPublicAuthNoise(page);

    await page.route("**/api/portal/portal-expired", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: json({ message: "This customer hub link is invalid or expired." }),
      });
    });

    await page.route("**/api/portal/portal-revoked", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: json({ message: "This customer hub link is invalid or expired." }),
      });
    });

    await page.route("**/api/portal/portal-invalid", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: json({ message: "This customer hub link is invalid or expired." }),
      });
    });

    await page.route("**/api/invoices/invoice-neighbor/public-html?token=invoice-valid-token", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "text/html; charset=utf-8",
        body: buildPublicPage({
          eyebrow: "Invoice link",
          title: "This invoice link is unavailable",
          content: "<p>The link may be expired, revoked, or no longer tied to this invoice.</p>",
        }),
      });
    });

    for (const token of ["portal-expired", "portal-revoked", "portal-invalid"]) {
      await page.goto(`/portal/${token}`);
      await expect(page.getByText(/this customer hub link is unavailable/i)).toBeVisible();
      await expect(page.getByText(/invalid or expired/i)).toBeVisible();
      await expect(page.getByText(/dashboard/i)).toHaveCount(0);
      await expect(page.getByText(/settings/i)).toHaveCount(0);
    }

    await page.goto("/api/invoices/invoice-neighbor/public-html?token=invoice-valid-token");
    await expect(page.getByRole("heading", { name: /this invoice link is unavailable/i })).toBeVisible();
    await expect(page.getByText(/expired, revoked, or no longer tied to this invoice/i)).toBeVisible();
    await expect(page.getByText(/inv-2007/i)).toHaveCount(0);
    await expect(page.getByText(/dashboard/i)).toHaveCount(0);
  });
});
