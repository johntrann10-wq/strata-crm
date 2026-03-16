# Onboarding New Users — Strata

This guide is for **people who will use the Strata app** (business owners and staff). It explains how to get started after your administrator has deployed the app.

---

## 1. Create your account

1. Open the app URL (e.g. `https://your-app.vercel.app`).
2. Click **Sign up** (or the equivalent link).
3. Enter:
   - Email address  
   - Password (meet any requirements shown)  
   - First and last name (if requested)
4. Submit the form. You may be redirected to sign in.

---

## 2. Create your first business (onboarding flow)

After signing in, you’ll be guided through setting up your business:

1. **Business type**  
   Choose the type that best fits (e.g. Detailing, Tire shop, Collision / body shop, Glass, General repair). This controls which features you see (e.g. route planner for mobile businesses).

2. **Staff and hours**  
   - Enter how many staff members you have.  
   - Set your typical operating hours and days (e.g. Mon–Fri 9am–5pm).

3. **Business details**  
   - Business name  
   - Email, phone, address (optional but useful for invoices and client communication)  
   - Timezone (for appointments and emails)

4. Complete the flow. You’ll land on the **dashboard**.

---

## 3. Dashboard

The dashboard shows:

- **Today’s revenue** — payments collected today  
- **This month** — total revenue for the month  
- **Open invoices** — count and outstanding balance  
- **Today’s jobs** — number of appointments today  
- **Total clients** — number of clients in your database  
- **Capacity** — how booked you are (e.g. this week)  
- **Upcoming appointments** — next few appointments  
- **Activity** — recent activity (if enabled)  
- **Smart insights** — suggestions based on your data (if enabled)

Use the **refresh** button to update the numbers. If something fails to load, a message and **Try again** will appear.

---

## 4. Calendar

- Open **Calendar** from the main navigation.
- Switch between **Month**, **Week**, and **Day**.
- Use **Today** to jump to the current date; use the arrows to move between periods.
- **New appointment** opens the quick-book flow.
- Click a day or a time slot to create an appointment there.
- Click an existing appointment to open its detail page (view, reschedule, or update status).

Appointments are scoped to your business and respect your business type (e.g. double-booking prevention for staff and business).

---

## 5. Clients and vehicles

- **Clients** — Add and manage clients (name, contact, address).  
- From a client, you can add **vehicles** (make, model, year, VIN, etc.).  
- Clients and vehicles are used when creating appointments and invoices.

Deleting a client soft-deletes them and their vehicles (they can be restored if your administrator supports it).

---

## 6. Appointments

- Create appointments from the calendar or from **Appointments**.
- Each appointment links a **client**, **vehicle**, and optionally **staff** and **location**.
- You can set status (e.g. scheduled → confirmed → in progress → completed) and add notes.
- Rescheduling is done from the appointment detail or the week/day calendar view.

---

## 7. Invoices and payments

- **Invoices** — Create invoices for clients (e.g. linked to an appointment). Add line items, discounts; the app can calculate totals.
- Send the invoice to the client (email) or share the link.  
- **Payments** — Record payments against an invoice (amount, method, date). Partial payments are supported; the invoice status updates (e.g. sent → partial → paid).
- You can void an invoice or reverse a payment when required; the app keeps the history.

---

## 8. Other features (by business type)

Depending on your **business type** set during onboarding, you may see:

- **Quotes** — Create and send quotes to clients.  
- **Route planner** — For mobile businesses (e.g. detailing) to plan stops.  
- **Lapsed clients** — Lists clients who haven’t visited in a while for re-engagement.  
- **Analytics** — Summary of revenue and activity.  
- **Automations** — Retry failed notification emails; other automation controls if enabled.

If a feature isn’t available for your business type, the app will show a short message and a link back to the dashboard instead of a broken page.

---

## 9. Sign out and security

- Use the user menu (e.g. top-right) to **Sign out**.  
- Keep your password private. If you lose access, contact your administrator to reset or recreate your account.

---

## 10. Getting help

- **Technical or access issues** — Contact your administrator or the team that deployed Strata.  
- **Feature requests or bugs** — Report them through your organization’s usual channel (e.g. support email, issue tracker).

For deployment and configuration (env vars, SMTP, cron, multi-tenant setup), see [DEPLOY.md](DEPLOY.md) and [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).
