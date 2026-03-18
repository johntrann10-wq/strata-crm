# Multi-Tenant Safety

All API routes enforce **tenant isolation** so that no action can read or write data belonging to another business.

## How tenancy works

- **Session**: After sign-in, `req.session.userId` is set. Middleware `requireAuth` ensures the user is logged in.
- **Business context**: `optionalAuth` / `requireAuth` sets `req.businessId` from the first business owned by the user (`businesses.ownerId === userId`). For apps with multiple businesses per user, the client would pass a business context (e.g. header or query); currently we use the first owned business.
- **Guards**: Every tenant-scoped route uses `requireTenant`, which throws if `req.businessId` is missing. All list/create/read/update/delete operations then filter or validate by `businessId`.

## Per-resource rules

| Resource       | List / Create / Read / Update / Delete |
|----------------|----------------------------------------|
| Users          | Own user only: `id === req.userId`     |
| Businesses     | List/filter by owner; create sets `ownerId = req.userId` |
| Clients        | `eq(clients.businessId, req.businessId)` |
| Vehicles       | `eq(vehicles.businessId, req.businessId)`; vehicle’s client must belong to business |
| Appointments   | `eq(appointments.businessId, req.businessId)`; client, vehicle, staff, location validated against business |
| Invoices       | `eq(invoices.businessId, req.businessId)`; client validated on create |
| Invoice line items | Via invoice: invoice must belong to business |
| Payments       | `eq(payments.businessId, req.businessId)`; invoice validated and must belong to business |
| Quotes         | `eq(quotes.businessId, req.businessId)` |
| Staff, Locations, Services | `eq(.*.businessId, req.businessId)` |

## Equivalent to “userBelongsToField”

- **Backend**: There is no cross-tenant access. Every query that returns or mutates tenant data includes `businessId` (and, where relevant, validates related entities like client/vehicle/invoice belong to the same business). This is the backend equivalent of ensuring “user belongs to field” (here, “user’s business owns the record”).
- **Frontend**: All API calls send `Authorization: Bearer <token>`. The backend derives the user (and then `businessId`) from the JWT and never trusts any client-supplied business ID for authorization; it only uses DB checks.

## Adding new routes

1. Use `requireAuth` and `requireTenant` for any route that touches tenant data.
2. For list/read: add `eq(table.businessId, businessId(req))` (or equivalent).
3. For create: set `businessId: businessId(req)` and validate any FKs (e.g. clientId, invoiceId) belong to the same business.
4. For update/delete: resolve the record first and ensure `record.businessId === businessId(req)` (or the record’s parent, e.g. invoice for line items).
