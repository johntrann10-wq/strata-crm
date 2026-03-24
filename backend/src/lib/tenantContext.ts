import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { businesses, businessMemberships } from "../db/schema.js";
import type { MembershipRole } from "./permissions.js";

export interface TenantContext {
  businessId: string;
  role: MembershipRole;
  source: "owner" | "membership";
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
      return { businessId: ownerScopedBusiness[0].id, role: "owner", source: "owner" };
    }

    const membershipScopedBusiness = await db
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
    if (membershipScopedBusiness[0]) {
      return {
        businessId: membershipScopedBusiness[0].businessId,
        role: membershipScopedBusiness[0].role,
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
    return { businessId: ownerBusiness[0].id, role: "owner", source: "owner" };
  }

  const membershipBusiness = await db
    .select({ businessId: businessMemberships.businessId, role: businessMemberships.role })
    .from(businessMemberships)
    .where(and(eq(businessMemberships.userId, userId), eq(businessMemberships.status, "active")))
    .limit(1);
  if (membershipBusiness[0]) {
    return {
      businessId: membershipBusiness[0].businessId,
      role: membershipBusiness[0].role,
      source: "membership",
    };
  }

  return null;
}
