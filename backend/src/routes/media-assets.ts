import { Router, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { appointments, clients, mediaAssets, vehicles } from "../db/schema.js";
import { createRequestActivityLog } from "../lib/activity.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import type { PermissionKey } from "../lib/permissions.js";

export const mediaAssetsRouter = Router();

const mediaEntityTypeSchema = z.enum(["appointment", "client", "vehicle"]);

const listMediaAssetsSchema = z.object({
  entityType: mediaEntityTypeSchema,
  entityId: z.string().uuid(),
  first: z.coerce.number().int().min(1).max(50).optional().default(24),
});

const createMediaAssetSchema = z.object({
  entityType: mediaEntityTypeSchema,
  entityId: z.string().uuid(),
  label: z.string().trim().min(1).max(160),
  fileName: z.string().trim().min(1).max(180),
  contentType: z
    .string()
    .trim()
    .regex(/^image\/(jpeg|jpg|png|webp)$/i, "Only JPEG, PNG, or WebP images are supported."),
  byteSize: z.coerce.number().int().min(1).max(1_500_000),
  width: z.coerce.number().int().min(1).max(8000).optional(),
  height: z.coerce.number().int().min(1).max(8000).optional(),
  dataUrl: z
    .string()
    .trim()
    .max(950_000, "Image is too large. Try a slightly smaller photo.")
    .regex(
      /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i,
      "Image upload payload is invalid."
    ),
});

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function getEntityReadPermission(entityType: z.infer<typeof mediaEntityTypeSchema>): PermissionKey {
  return entityType === "appointment" ? "appointments.read" : "customers.read";
}

function getEntityWritePermission(entityType: z.infer<typeof mediaEntityTypeSchema>): PermissionKey {
  return entityType === "appointment" ? "appointments.write" : "customers.write";
}

function assertPermission(req: Request, permission: PermissionKey) {
  if (!Array.isArray(req.permissions) || !req.permissions.includes(permission)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

async function assertEntityAccess(params: {
  businessId: string;
  entityType: z.infer<typeof mediaEntityTypeSchema>;
  entityId: string;
}): Promise<void> {
  if (params.entityType === "appointment") {
    const [record] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq(appointments.businessId, params.businessId), eq(appointments.id, params.entityId)))
      .limit(1);
    if (!record) throw new NotFoundError("Appointment not found.");
    return;
  }

  if (params.entityType === "client") {
    const [record] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.businessId, params.businessId), eq(clients.id, params.entityId)))
      .limit(1);
    if (!record) throw new NotFoundError("Client not found.");
    return;
  }

  const [record] = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.businessId, params.businessId), eq(vehicles.id, params.entityId)))
    .limit(1);
  if (!record) throw new NotFoundError("Vehicle not found.");
}

function serializeMediaAsset(record: {
  id: string;
  entityType: string;
  entityId: string;
  label: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  dataUrl: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: record.id,
    entityType: record.entityType,
    entityId: record.entityId,
    label: record.label,
    fileName: record.fileName,
    contentType: record.contentType,
    byteSize: record.byteSize,
    width: record.width,
    height: record.height,
    dataUrl: record.dataUrl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

mediaAssetsRouter.get(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = listMediaAssetsSchema.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");

    const bid = businessId(req);
    assertPermission(req, getEntityReadPermission(parsed.data.entityType));
    await assertEntityAccess({
      businessId: bid,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
    });

    const records = await db
      .select({
        id: mediaAssets.id,
        entityType: mediaAssets.entityType,
        entityId: mediaAssets.entityId,
        label: mediaAssets.label,
        fileName: mediaAssets.fileName,
        contentType: mediaAssets.contentType,
        byteSize: mediaAssets.byteSize,
        width: mediaAssets.width,
        height: mediaAssets.height,
        dataUrl: mediaAssets.dataUrl,
        createdAt: mediaAssets.createdAt,
        updatedAt: mediaAssets.updatedAt,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.businessId, bid),
          eq(mediaAssets.entityType, parsed.data.entityType),
          eq(mediaAssets.entityId, parsed.data.entityId)
        )
      )
      .orderBy(desc(mediaAssets.createdAt))
      .limit(parsed.data.first);

    res.json({ records: records.map(serializeMediaAsset) });
  })
);

mediaAssetsRouter.post(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = createMediaAssetSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");

    const bid = businessId(req);
    assertPermission(req, getEntityWritePermission(parsed.data.entityType));
    await assertEntityAccess({
      businessId: bid,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
    });

    const now = new Date();
    const [created] = await db
      .insert(mediaAssets)
      .values({
        businessId: bid,
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        label: parsed.data.label,
        fileName: parsed.data.fileName,
        contentType: parsed.data.contentType.toLowerCase() === "image/jpg" ? "image/jpeg" : parsed.data.contentType.toLowerCase(),
        byteSize: parsed.data.byteSize,
        width: parsed.data.width ?? null,
        height: parsed.data.height ?? null,
        dataUrl: parsed.data.dataUrl,
        createdByUserId: req.userId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: mediaAssets.id,
        entityType: mediaAssets.entityType,
        entityId: mediaAssets.entityId,
        label: mediaAssets.label,
        fileName: mediaAssets.fileName,
        contentType: mediaAssets.contentType,
        byteSize: mediaAssets.byteSize,
        width: mediaAssets.width,
        height: mediaAssets.height,
        dataUrl: mediaAssets.dataUrl,
        createdAt: mediaAssets.createdAt,
        updatedAt: mediaAssets.updatedAt,
      });

    if (!created) throw new BadRequestError("Could not save this photo.");

    await createRequestActivityLog(req, {
      businessId: bid,
      action: `${parsed.data.entityType}.media_added`,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      metadata: {
        mediaAssetId: created.id,
        label: created.label,
        fileName: created.fileName,
        contentType: created.contentType,
        byteSize: created.byteSize,
      },
    });

    res.status(201).json({ record: serializeMediaAsset(created) });
  })
);
