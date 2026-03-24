import { Router, Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { businessMemberships, staff, users } from "../db/schema.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import type { MembershipRole } from "../lib/permissions.js";

export const staffRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function canManageTeam(role: string | undefined): role is MembershipRole {
  return role === "owner" || role === "admin" || role === "manager";
}

function requireTeamManager(req: Request): MembershipRole {
  if (!canManageTeam(req.membershipRole)) {
    throw new ForbiddenError("You do not have permission to manage team members.");
  }
  return req.membershipRole;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const createStaffSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["owner", "admin", "manager", "service_advisor", "technician"]).default("technician"),
  phone: z.string().optional().or(z.literal("")),
  active: z.boolean().optional(),
});

const updateStaffSchema = createStaffSchema.partial().extend({
  id: z.string().uuid(),
  status: z.enum(["invited", "active", "suspended"]).optional(),
});

staffRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const list = await db
    .select()
    .from(staff)
    .where(eq(staff.businessId, businessId(req)))
    .orderBy(desc(staff.createdAt))
    .limit(100);

  const memberships = await db
    .select()
    .from(businessMemberships)
    .where(eq(businessMemberships.businessId, businessId(req)));

  const membershipByUserId = new Map(memberships.map((membership) => [membership.userId, membership]));

  res.json({
    records: list.map((row) => {
      const membership = row.userId ? membershipByUserId.get(row.userId) : null;
      return {
        ...row,
        membershipRole: membership?.role ?? row.role ?? "technician",
        membershipStatus: membership?.status ?? (row.active === false ? "suspended" : "active"),
      };
    }),
  });
});

staffRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(staff)
    .where(eq(staff.id, req.params.id))
    .limit(1);
  if (!row || row.businessId !== req.businessId) throw new NotFoundError("Staff not found.");
  res.json(row);
});

staffRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  requireTeamManager(req);
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");

  const tenantId = businessId(req);
  const email = parsed.data.email ? normalizeEmail(parsed.data.email) : null;

  const existingUser = email
    ? await db.select().from(users).where(eq(users.email, email)).limit(1)
    : [];
  const user = existingUser[0] ?? null;

  if (user) {
    const existingMembership = await db
      .select()
      .from(businessMemberships)
      .where(and(eq(businessMemberships.businessId, tenantId), eq(businessMemberships.userId, user.id)))
      .limit(1);
    if (existingMembership[0]) {
      throw new BadRequestError("That user is already part of this business.");
    }
  }

  const newUserId = user?.id ?? (email ? randomUUID() : null);
  const membershipStatus = user?.passwordHash ? "active" : "invited";
  const role = parsed.data.role;

  const [created] = await db.transaction(async (tx) => {
    if (!user && email && newUserId) {
      await tx.insert(users).values({
        id: newUserId,
        email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
      });
    }

    if (newUserId) {
      await tx.insert(businessMemberships).values({
        id: randomUUID(),
        businessId: tenantId,
        userId: newUserId,
        role,
        status: membershipStatus,
        invitedByUserId: req.userId,
        invitedAt: new Date(),
        joinedAt: membershipStatus === "active" ? new Date() : null,
      });
    }

    return tx
      .insert(staff)
      .values({
        id: randomUUID(),
        businessId: tenantId,
        userId: newUserId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email,
        role,
        active: parsed.data.active ?? true,
      })
      .returning();
  });

  res.status(201).json({
    ...created,
    membershipRole: role,
    membershipStatus,
  });
});

staffRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  requireTeamManager(req);
  const parsed = updateStaffSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");

  const [existing] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, req.params.id), eq(staff.businessId, businessId(req))))
    .limit(1);
  if (!existing) throw new NotFoundError("Staff not found.");

  if (existing.userId) {
    const [membership] = await db
      .select()
      .from(businessMemberships)
      .where(and(eq(businessMemberships.businessId, businessId(req)), eq(businessMemberships.userId, existing.userId)))
      .limit(1);
    if (membership?.role === "owner" && parsed.data.role && parsed.data.role !== "owner") {
      throw new BadRequestError("Owner role cannot be changed here.");
    }
    if (membership?.role === "owner" && parsed.data.status === "suspended") {
      throw new BadRequestError("Owner cannot be suspended.");
    }
  }

  const email = parsed.data.email ? normalizeEmail(parsed.data.email) : parsed.data.email === "" ? null : undefined;
  const [updated] = await db.transaction(async (tx) => {
    const [updatedStaff] = await tx
      .update(staff)
      .set({
        firstName: parsed.data.firstName ?? existing.firstName,
        lastName: parsed.data.lastName ?? existing.lastName,
        email: email ?? existing.email,
        role: parsed.data.role ?? existing.role,
        active: parsed.data.active ?? existing.active ?? true,
        updatedAt: new Date(),
      })
      .where(eq(staff.id, existing.id))
      .returning();

    if (existing.userId) {
      await tx
        .update(businessMemberships)
        .set({
          role: parsed.data.role ?? undefined,
          status: parsed.data.status ?? (parsed.data.active === false ? "suspended" : undefined),
          updatedAt: new Date(),
        })
        .where(and(eq(businessMemberships.businessId, businessId(req)), eq(businessMemberships.userId, existing.userId)));
    }

    return [updatedStaff];
  });

  const [membership] = existing.userId
    ? await db
        .select()
        .from(businessMemberships)
        .where(and(eq(businessMemberships.businessId, businessId(req)), eq(businessMemberships.userId, existing.userId)))
        .limit(1)
    : [null];

  res.json({
    ...updated,
    membershipRole: membership?.role ?? updated.role ?? "technician",
    membershipStatus: membership?.status ?? (updated.active === false ? "suspended" : "active"),
  });
});

staffRouter.delete("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  requireTeamManager(req);
  const [existing] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, req.params.id), eq(staff.businessId, businessId(req))))
    .limit(1);
  if (!existing) throw new NotFoundError("Staff not found.");

  if (existing.userId) {
    const [membership] = await db
      .select()
      .from(businessMemberships)
      .where(and(eq(businessMemberships.businessId, businessId(req)), eq(businessMemberships.userId, existing.userId)))
      .limit(1);
    if (membership?.role === "owner") {
      throw new BadRequestError("Owner cannot be removed.");
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(staff)
      .set({ active: false, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(staff.id, existing.id));

    if (existing.userId) {
      await tx
        .update(businessMemberships)
        .set({ status: "suspended", isDefault: false, updatedAt: new Date() })
        .where(and(eq(businessMemberships.businessId, businessId(req)), eq(businessMemberships.userId, existing.userId)));
    }
  });

  res.json({ ok: true });
});
