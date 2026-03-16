# Performance & UX (Stage 5)

## Calendar load &lt;2s

- **Backend**  
  - `GET /api/appointments` supports a **date-range filter** (from the calendar’s view range). Only appointments in the current month/week/day are fetched.  
  - **Single query with joins**: appointments are returned with `client` (firstName, lastName), `vehicle` (make, model), and `assignedStaff` (firstName, lastName) in one go, so the frontend doesn’t need extra round trips.  
  - **Sort**: when the request sends `sort: { startTime: "Ascending" }`, results are ordered by `startTime` asc for the calendar.  
  - **Limit**: up to 500 records when a date range is used; calendar requests 250.

- **Frontend**  
  - Calendar sends `filter` with `startTime` in the view range and `sort: { startTime: "Ascending" }`.  
  - Loading and error states: spinner while fetching; on error, a message and “Try again” trigger a refetch.

## Dashboard

- **Backend**  
  - **getDashboardStats**: all stats queries run in **parallel** (`Promise.all`). Response includes todayRevenue, revenueThisMonth, openInvoicesCount, outstandingBalance, todayAppointmentsCount, totalClients, etc.  
  - **getCapacityInsights**: scoped to **this week** (start/end of week) and limited to 100 appointments to keep the payload small.

- **Frontend**  
  - If stats or capacity fail, a banner shows the error and a “Try again” button that triggers a refresh.

## Activity and notification logs

- **Backend**  
  - `GET /api/activity-logs` and `GET /api/notification-logs` are implemented so the dashboard can load without 404s.  
  - Notification logs support filtering by `status: "failed"` (via `filter` query param) for the “failed notifications” indicator.

## Error handling

- **Calendar**: Error message + “Try again”;
- **Dashboard**: Banner with error message + “Try again” when getDashboardStats or getCapacityInsights fails.
