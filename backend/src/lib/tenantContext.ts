import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { businesses, businessMemberships, membershipPermissionGrants } from "../db/schema.js";
import type { MembershipRole, PermissionKey } from "./permissions.js";
import { resolvePermissionsForRole } from "./permissions.js";
import { logger } from "./logger.js";
import { warnOnce } from "./warnOnce.js";

export interface TenantContext {
  businessId: string;
  role: MembershipRole;
  permissions: PermissionKey[];
  source: "owner" | "membership";
}

function isTenantSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

export async function resolveTenantContext(
  userId: string,
  preferredBusinessId?: string | null
): Promise<TenantContext | null> {
  const normalizedPreferredBusinessId = typeof preferredBusinessId === "string" && preferredBusinessId.trim() !== ""
    ? preferredBusinessId.trim()
    : null;

  if (normalizedPreferredBusinessId) {
    const ownerScopedBusiness = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(and(eq(businesses.id, normalizedPreferredBusinessId), eq(businesses.ownerId, userId)))
      .limit(1);
    if (ownerScopedBusiness[0]) {
      return {
        businessId: ownerScopedBusiness[0].id,
        role: "owner",
        permissions: Array.from(resolvePermissionsForRole("owner")),
        source: "owner",
      };
    }

    let membershipScopedBusiness:
      | Array<{ businessId: string; role: MembershipRole }>
      | [] = [];
    try {
      membershipScopedBusiness = await db
        .select({ businessId: businessMemberships.businessId, role: businessMemberships.role })
        .from(businessMemberships)
        .where(
          and(
            eq(businessMemberships.businessId, normalizedPreferredBusinessId),
            eq(businessMemberships.userId, userId),
            eq(businessMemberships.status, "active")
          )
        )
        .limit(1);
    } catch (error) {
      if (!isTenantSchemaDriftError(error)) throw error;
      warnOnce("tenant:preferred-membership-schema", "business membership schema unavailable during tenant resolution", {
        userId,
        preferredBusinessId: normalizedPreferredBusinessId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (membershipScopedBusiness[0]) {
      const overrides = await db
        .select({ permission: membershipPermissionGrants.permission, enabled: membershipPermissionGrants.enabled })
        .from(membershipPermissionGrants)
        .where(
          and(
            eq(membershipPermissionGrants.businessId, normalizedPreferredBusinessId),
            eq(membershipPermissionGrants.userId, userId)
          )
        )
        .catch((error) => {
          if (!isTenantSchemaDriftError(error)) throw error;
          warnOnce("tenant:preferred-membership-permissions-schema", "membership permission grant schema unavailable during tenant resolution", {
            userId,
            preferredBusinessId: normalizedPreferredBusinessId,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        });
      return {
        businessId: membershipScopedBusiness[0].businessId,
        role: membershipScopedBusiness[0].role,
        permissions: Array.from(resolvePermissionsForRole(membershipScopedBusiness[0].role, overrides)),
        source: "membership",
      };
    }
  }

  const ownerBusiness = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.ownerId, userId))
    .limit(1);
  if (ownerBusiness[0]) {
    return {
      businessId: ownerBusiness[0].id,
      role: "owner",
      permissions: Array.from(resolvePermissionsForRole("owner")),
      source: "owner",
    };
  }

  let membershipBusiness:
    | Array<{ businessId: string; role: MembershipRole }>
    | [] = [];
  try {
    membershipBusiness = await db
      .select({ businessId: businessMemberships.businessId, role: businessMemberships.role })
      .from(businessMemberships)
      .where(and(eq(businessMemberships.userId, userId), eq(businessMemberships.status, "active")))
      .limit(1);
  } catch (error) {
    if (!isTenantSchemaDriftError(error)) throw error;
    warnOnce("tenant:bootstrap-membership-schema", "business membership schema unavailable during tenant bootstrap", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (membershipBusiness[0]) {
    const overrides = await db
      .select({ permission: membershipPermissionGrants.permission, enabled: membershipPermissionGrants.enabled })
      .from(membershipPermissionGrants)
      .where(
        and(
          eq(membershipPermissionGrants.businessId, membershipBusiness[0].businessId),
          eq(membershipPermissionGrants.userId, userId)
        )
      )
      .catch((error) => {
        if (!isTenantSchemaDriftError(error)) throw error;
        warnOnce("tenant:membership-permissions-schema", "membership permission grant schema unavailable during tenant bootstrap", {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      });
    return {
      businessId: membershipBusiness[0].businessId,
      role: membershipBusiness[0].role,
      permissions: Array.from(resolvePermissionsForRole(membershipBusiness[0].role, overrides)),
      source: "membership",
    };
  }

  return null;
}
