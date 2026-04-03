import { Router, Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { businesses, businessMemberships, staff, users } from "../db/schema.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import type { MembershipRole } from "../lib/permissions.js";
import { logger } from "../lib/logger.js";
import { warnOnce } from "../lib/warnOnce.js";
import { createTeamInviteToken } from "../lib/jwt.js";
import { sendTemplatedEmail } from "../lib/email.js";
import { isEmailConfigured } from "../lib/env.js";

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

function resolveFrontendBaseUrl(req: Request): string {
  const configured = process.env.FRONTEND_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const origin = req.get("origin")?.trim();
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/+$/, "");
  const host = req.get("host")?.trim();
  if (host) {
    const protocol = req.secure || req.get("x-forwarded-proto") === "https" ? "https" : "http";
    return `${protocol}://${host}`.replace(/\/+$/, "");
  }
  throw new BadRequestError("Team invites are not configured.");
}

function formatRoleLabel(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveStaffAccessStatus(row: { userId?: string | null; active?: boolean | null }, membershipStatus?: string | null) {
  if (membershipStatus) return membershipStatus;
  if (!row.userId) return "roster_only";
  if (row.active === false) return "suspended";
  return "active";
}

async function buildInviteContext(req: Request, invitee: { id: string; email: string; firstName: string | null; lastName: string | null }, role: string) {
  const tenantId = businessId(req);
  const [business] = await db
    .select({ name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, tenantId))
    .limit(1);
  const [inviter] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(eq(users.id, req.userId ?? ""))
    .limit(1);

  const businessName = business?.name?.trim() || "your shop";
  const inviterName =
    `${inviter?.firstName ?? ""} ${inviter?.lastName ?? ""}`.trim() || inviter?.email || "Your shop admin";
  const inviteToken = createTeamInviteToken(invitee.id, invitee.email, tenantId);
  const params = new URLSearchParams({
    inviteToken,
    email: invitee.email,
    redirectPath: "/signed-in",
  });
  if (invitee.firstName?.trim()) params.set("firstName", invitee.firstName.trim());
  if (invitee.lastName?.trim()) params.set("lastName", invitee.lastName.trim());
  params.set("businessName", businessName);
  const inviteUrl = `${resolveFrontendBaseUrl(req)}/sign-up?${params.toString()}`;

  return {
    businessName,
    inviterName,
    inviteUrl,
    roleLabel: formatRoleLabel(role),
  };
}

async function getInviteTarget(req: Request, staffId: string) {
  const tenantId = businessId(req);
  const [existing] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.businessId, tenantId), isNull(staff.deletedAt)))
    .limit(1);
  if (!existing) throw new NotFoundError("Staff not found.");
  if (!existing.userId || !existing.email) {
    throw new BadRequestError("This team member does not have a login email to invite.");
  }

  const [membership] = await db
    .select({ role: businessMemberships.role, status: businessMemberships.status })
    .from(businessMemberships)
    .where(and(eq(businessMemberships.businessId, tenantId), eq(businessMemberships.userId, existing.userId)))
    .limit(1);

  if (!membership) {
    throw new BadRequestError("This team member is missing a business membership record.");
  }
  if (membership.status !== "invited") {
    throw new BadRequestError("Only invited team members can use invite links.");
  }

  return {
    existing,
    membership,
  };
}

async function sendTeamInvite(req: Request, invitee: { id: string; email: string; firstName: string | null; lastName: string | null }, role: string) {
  if (!isEmailConfigured()) {
    return { inviteDelivery: "not_configured" as const };
  }

  const context = await buildInviteContext(req, invitee, role);
  await sendTemplatedEmail({
    to: invitee.email,
    businessId: businessId(req),
    templateSlug: "team_invite",
    vars: {
      userName: invitee.firstName?.trim() || invitee.email,
      businessName: context.businessName,
      inviterName: context.inviterName,
      roleLabel: context.roleLabel,
      inviteEmail: invitee.email,
      inviteUrl: context.inviteUrl,
    },
  });

  return { inviteDelivery: "sent" as const };
}

async function sendTeamAccessReady(req: Request, recipient: { email: string; firstName: string | null }, role: string) {
  if (!isEmailConfigured()) {
    return { inviteDelivery: "not_configured" as const };
  }

  const tenantId = businessId(req);
  const [business] = await db
    .select({ name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, tenantId))
    .limit(1);
  const businessName = business?.name?.trim() || "your shop";
  const signInParams = new URLSearchParams({
    email: recipient.email,
    redirectPath: "/signed-in",
  });
  const signInUrl = `${resolveFrontendBaseUrl(req)}/sign-in?${signInParams.toString()}`;

  await sendTemplatedEmail({
    to: recipient.email,
    businessId: tenantId,
    templateSlug: "team_access_ready",
    vars: {
      userName: recipient.firstName?.trim() || recipient.email,
      businessName,
      roleLabel: formatRoleLabel(role),
      signInUrl,
    },
  });

  return { inviteDelivery: "sent" as const };
}

function isStaffSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const cause = "cause" in error ? (error as { cause?: unknown }).cause : error;
  if (!cause || typeof cause !== "object") return false;
  const code = (cause as { code?: string }).code;
  const message = String((cause as { message?: string }).message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
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

staffRouter.get("/", requireAuth, requireTenant, requirePermission("team.read"), async (req: Request, res: Response) => {
  const tenantId = businessId(req);
  const list = await db
    .select()
    .from(staff)
    .where(and(eq(staff.businessId, tenantId), isNull(staff.deletedAt)))
    .orderBy(desc(staff.createdAt))
    .limit(100);

  let memberships: Array<{ userId: string; role: MembershipRole; status: string }> = [];
  try {
    memberships = await db
      .select({
        userId: businessMemberships.userId,
        role: businessMemberships.role,
        status: businessMemberships.status,
      })
      .from(businessMemberships)
      .where(eq(businessMemberships.businessId, tenantId));
  } catch (error) {
    if (!isStaffSchemaDriftError(error)) throw error;
    warnOnce("staff:list:memberships", "staff list falling back without business memberships", {
      businessId: tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const membershipByUserId = new Map(memberships.map((membership) => [membership.userId, membership]));

  res.json({
    records: list.map((row) => {
      const membership = row.userId ? membershipByUserId.get(row.userId) : null;
      return {
        ...row,
        membershipRole: membership?.role ?? row.role ?? "technician",
        membershipStatus: resolveStaffAccessStatus(row, membership?.status),
      };
    }),
  });
});

staffRouter.get("/:id", requireAuth, requireTenant, requirePermission("team.read"), async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, req.params.id), isNull(staff.deletedAt)))
    .limit(1);
  if (!row || row.businessId !== req.businessId) throw new NotFoundError("Staff not found.");
  res.json(row);
});

staffRouter.post("/", requireAuth, requireTenant, requirePermission("team.write"), async (req: Request, res: Response) => {
  requireTeamManager(req);
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");

  const tenantId = businessId(req);
  const email = parsed.data.email ? normalizeEmail(parsed.data.email) : null;

  const existingUser = email
    ? await db.select().from(users).where(eq(users.email, email)).limit(1)
    : [];
  const user = existingUser[0] ?? null;

  if (email) {
    const [existingStaffByEmail] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.businessId, tenantId), eq(staff.email, email), isNull(staff.deletedAt)))
      .limit(1);
    if (existingStaffByEmail) {
      throw new BadRequestError("A team member with that email already exists.");
    }
  }

  if (user) {
    const [existingStaffByUser] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.businessId, tenantId), eq(staff.userId, user.id), isNull(staff.deletedAt)))
      .limit(1);
    if (existingStaffByUser) {
      throw new BadRequestError("That user already has a team member profile in this business.");
    }

    try {
      const existingMembership = await db
        .select()
        .from(businessMemberships)
        .where(and(eq(businessMemberships.businessId, tenantId), eq(businessMemberships.userId, user.id)))
        .limit(1);
      if (existingMembership[0]) {
        throw new BadRequestError("That user is already part of this business.");
      }
    } catch (error) {
      if (!isStaffSchemaDriftError(error)) throw error;
        warnOnce("staff:create:duplicate-check", "staff create skipping membership duplicate check due to schema drift", {
          businessId: tenantId,
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
      });
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
      try {
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
      } catch (error) {
        if (!isStaffSchemaDriftError(error)) throw error;
        warnOnce("staff:create:membership-insert", "staff create skipping membership insert due to schema drift", {
          businessId: tenantId,
          userId: newUserId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
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

  const inviteResult =
    email && newUserId
      ? membershipStatus === "invited"
        ? await sendTeamInvite(
            req,
            {
              id: newUserId,
              email,
              firstName: parsed.data.firstName,
              lastName: parsed.data.lastName,
            },
            role
          )
        : await sendTeamAccessReady(
            req,
            {
              email,
              firstName: parsed.data.firstName,
            },
            role
          )
      : { inviteDelivery: "not_needed" as const };

  res.status(201).json({
    ...created,
    membershipRole: role,
    membershipStatus: resolveStaffAccessStatus(created, membershipStatus),
    inviteDelivery: inviteResult.inviteDelivery,
  });
});

staffRouter.patch("/:id", requireAuth, requireTenant, requirePermission("team.write"), async (req: Request, res: Response) => {
  requireTeamManager(req);
  const parsed = updateStaffSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");

  const tenantId = businessId(req);
  const [existing] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, req.params.id), eq(staff.businessId, tenantId), isNull(staff.deletedAt)))
    .limit(1);
  if (!existing) throw new NotFoundError("Staff not found.");

  const email = parsed.data.email ? normalizeEmail(parsed.data.email) : parsed.data.email === "" ? null : undefined;

  if (email) {
    const [duplicateByEmail] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.businessId, tenantId), eq(staff.email, email), isNull(staff.deletedAt), ne(staff.id, existing.id)))
      .limit(1);
    if (duplicateByEmail) {
      throw new BadRequestError("A team member with that email already exists.");
    }
  }

  let membership: { role?: MembershipRole; status?: string } | null = null;
  if (existing.userId) {
    try {
      const [membershipRow] = await db
        .select({
          role: businessMemberships.role,
          status: businessMemberships.status,
        })
        .from(businessMemberships)
        .where(and(eq(businessMemberships.businessId, tenantId), eq(businessMemberships.userId, existing.userId)))
        .limit(1);
      membership = membershipRow ?? null;
    } catch (error) {
      if (!isStaffSchemaDriftError(error)) throw error;
      warnOnce("staff:update:owner-check", "staff update skipping membership owner check due to schema drift", {
        businessId: tenantId,
        staffId: existing.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (membership?.role === "owner" && parsed.data.role && parsed.data.role !== "owner") {
    throw new BadRequestError("Owner role cannot be changed here.");
  }
  if (membership?.role === "owner" && parsed.data.status === "suspended") {
    throw new BadRequestError("Owner cannot be suspended.");
  }

  const emailChanged = email !== undefined && email !== (existing.email ?? null);
  let targetUserId = existing.userId ?? null;
  let nextMembershipStatus = membership?.status ?? (existing.active === false ? "suspended" : "active");
  let inviteDelivery: "sent" | "not_configured" | "not_needed" = "not_needed";

  const [updated] = await db.transaction(async (tx) => {
    let linkedUser:
      | {
          id: string;
          email: string;
          passwordHash: string | null;
        }
      | null = null;

    if (email && (!existing.userId || emailChanged)) {
      const [foundUser] = await tx
        .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      linkedUser = foundUser ?? null;
    }

    if (linkedUser && existing.userId && linkedUser.id !== existing.userId) {
      throw new BadRequestError("That email is already tied to another Strata account.");
    }

    if (!existing.userId && email) {
      const nextUserId = linkedUser?.id ?? randomUUID();
      targetUserId = nextUserId;
      nextMembershipStatus = linkedUser?.passwordHash ? "active" : "invited";
      const membershipRole: MembershipRole =
        (parsed.data.role as MembershipRole | undefined) ??
        ((existing.role as MembershipRole | null | undefined) ?? "technician");

      if (!linkedUser) {
        await tx.insert(users).values({
          id: nextUserId,
          email,
          firstName: parsed.data.firstName ?? existing.firstName,
          lastName: parsed.data.lastName ?? existing.lastName,
        });
      }

      try {
        const [existingMembership] = await tx
          .select({ id: businessMemberships.id })
          .from(businessMemberships)
          .where(and(eq(businessMemberships.businessId, tenantId), eq(businessMemberships.userId, nextUserId)))
          .limit(1);
        if (!existingMembership) {
          await tx.insert(businessMemberships).values({
            id: randomUUID(),
            businessId: tenantId,
            userId: nextUserId,
            role: membershipRole,
            status: nextMembershipStatus as "invited" | "active" | "suspended",
            invitedByUserId: req.userId,
            invitedAt: new Date(),
            joinedAt: nextMembershipStatus === "active" ? new Date() : null,
          });
        }
      } catch (error) {
        if (!isStaffSchemaDriftError(error)) throw error;
        logger.warn("staff update skipping membership insert due to schema drift", {
          businessId: tenantId,
          staffId: existing.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (existing.userId) {
      targetUserId = existing.userId;
      if (emailChanged && email) {
        const [userConflict] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, email), ne(users.id, existing.userId)))
          .limit(1);
        if (userConflict) {
          throw new BadRequestError("That email is already tied to another Strata account.");
        }
      }

      await tx
        .update(users)
        .set({
          email: email ?? existing.email ?? undefined,
          firstName: parsed.data.firstName ?? existing.firstName,
          lastName: parsed.data.lastName ?? existing.lastName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.userId));
    }

    const [updatedStaff] = await tx
      .update(staff)
      .set({
        firstName: parsed.data.firstName ?? existing.firstName,
        lastName: parsed.data.lastName ?? existing.lastName,
        email: email ?? existing.email,
        userId: targetUserId,
        role: parsed.data.role ?? existing.role,
        active: parsed.data.active ?? existing.active ?? true,
        updatedAt: new Date(),
      })
      .where(eq(staff.id, existing.id))
      .returning();

    if (targetUserId) {
      try {
        await tx
          .update(businessMemberships)
          .set({
            role: parsed.data.role ?? undefined,
            status: parsed.data.status ?? (parsed.data.active === false ? "suspended" : !existing.userId && nextMembershipStatus === "invited" ? "invited" : undefined),
            updatedAt: new Date(),
          })
          .where(and(eq(businessMemberships.businessId, tenantId), eq(businessMemberships.userId, targetUserId)));
      } catch (error) {
        if (!isStaffSchemaDriftError(error)) throw error;
        logger.warn("staff update skipping membership sync due to schema drift", {
          businessId: tenantId,
          staffId: existing.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (targetUserId && !existing.userId && email) {
      inviteDelivery =
        nextMembershipStatus === "invited"
          ? (
              await sendTeamInvite(
                req,
                {
                  id: targetUserId,
                  email,
                  firstName: updatedStaff.firstName,
                  lastName: updatedStaff.lastName,
                },
                parsed.data.role ?? updatedStaff.role ?? "technician"
              )
            ).inviteDelivery
          : (
              await sendTeamAccessReady(
                req,
                {
                  email,
                  firstName: updatedStaff.firstName,
                },
                parsed.data.role ?? updatedStaff.role ?? "technician"
              )
            ).inviteDelivery;
    }

    return [updatedStaff];
  });

  membership = null;
  if (targetUserId) {
    try {
      const [membershipRow] = await db
        .select({
          role: businessMemberships.role,
          status: businessMemberships.status,
        })
        .from(businessMemberships)
        .where(and(eq(businessMemberships.businessId, tenantId), eq(businessMemberships.userId, targetUserId)))
        .limit(1);
      membership = membershipRow ?? null;
    } catch (error) {
      if (!isStaffSchemaDriftError(error)) throw error;
      logger.warn("staff update response falling back without membership", {
        businessId: tenantId,
        staffId: existing.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  res.json({
    ...updated,
    membershipRole: membership?.role ?? updated.role ?? "technician",
    membershipStatus: resolveStaffAccessStatus(updated, membership?.status),
    inviteDelivery,
  });
});

staffRouter.post("/:id/resend-invite", requireAuth, requireTenant, requirePermission("team.write"), async (req: Request, res: Response) => {
  requireTeamManager(req);
  const { existing, membership } = await getInviteTarget(req, req.params.id);

  const inviteResult = await sendTeamInvite(
    req,
    {
      id: existing.userId!,
      email: normalizeEmail(existing.email!),
      firstName: existing.firstName,
      lastName: existing.lastName,
    },
    membership.role ?? existing.role ?? "technician"
  );

  res.json({
    ok: true,
    inviteDelivery: inviteResult.inviteDelivery,
  });
});

staffRouter.post("/:id/invite-link", requireAuth, requireTenant, requirePermission("team.write"), async (req: Request, res: Response) => {
  requireTeamManager(req);
  const { existing, membership } = await getInviteTarget(req, req.params.id);
  const context = await buildInviteContext(
    req,
    {
      id: existing.userId!,
      email: normalizeEmail(existing.email!),
      firstName: existing.firstName,
      lastName: existing.lastName,
    },
    membership.role ?? existing.role ?? "technician"
  );

  res.json({
    ok: true,
    inviteUrl: context.inviteUrl,
    inviteEmail: normalizeEmail(existing.email!),
  });
});

staffRouter.delete("/:id", requireAuth, requireTenant, requirePermission("team.write"), async (req: Request, res: Response) => {
  requireTeamManager(req);
  const [existing] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, req.params.id), eq(staff.businessId, businessId(req)), isNull(staff.deletedAt)))
    .limit(1);
  if (!existing) throw new NotFoundError("Staff not found.");

  if (existing.userId) {
    let membership: { role?: MembershipRole } | null = null;
    try {
      const [membershipRow] = await db
        .select({ role: businessMemberships.role })
        .from(businessMemberships)
        .where(and(eq(businessMemberships.businessId, businessId(req)), eq(businessMemberships.userId, existing.userId)))
        .limit(1);
      membership = membershipRow ?? null;
    } catch (error) {
      if (!isStaffSchemaDriftError(error)) throw error;
      logger.warn("staff delete skipping membership owner check due to schema drift", {
        businessId: businessId(req),
        staffId: existing.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
      try {
        await tx
          .update(businessMemberships)
          .set({ status: "suspended", isDefault: false, updatedAt: new Date() })
          .where(and(eq(businessMemberships.businessId, businessId(req)), eq(businessMemberships.userId, existing.userId)));
      } catch (error) {
        if (!isStaffSchemaDriftError(error)) throw error;
        logger.warn("staff delete skipping membership suspension due to schema drift", {
          businessId: businessId(req),
          staffId: existing.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  res.json({ ok: true });
});
