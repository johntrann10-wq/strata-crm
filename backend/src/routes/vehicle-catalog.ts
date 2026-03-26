import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getVehicleCatalogProvider } from "../lib/vehicleCatalogService.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { BadRequestError } from "../lib/errors.js";

export const vehicleCatalogRouter = Router();

const yearsQuery = z.object({});
const makesQuery = z.object({
  year: z.coerce.number().int().min(1981).max(new Date().getFullYear() + 1),
});
const modelsQuery = z.object({
  year: z.coerce.number().int().min(1981).max(new Date().getFullYear() + 1),
  makeId: z.string().min(1),
  make: z.string().optional(),
});
const trimsQuery = z.object({
  year: z.coerce.number().int().min(1981).max(new Date().getFullYear() + 1),
  makeId: z.string().min(1),
  make: z.string().optional(),
  model: z.string().min(1),
});
const vinLookupBody = z.object({
  vin: z.string().trim().min(11).max(17),
});

vehicleCatalogRouter.get(
  "/years",
  requireAuth,
  wrapAsync(async (_req: Request, res: Response) => {
    const provider = getVehicleCatalogProvider();
    const years = await provider.listYears();
    res.json({
      records: years.map((year) => ({
        id: String(year),
        year,
        label: String(year),
      })),
      provider: provider.name,
    });
  })
);

vehicleCatalogRouter.get(
  "/makes",
  requireAuth,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = makesQuery.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid year");
    const provider = getVehicleCatalogProvider();
    const records = await provider.listMakes(parsed.data.year);
    res.json({ records, provider: provider.name });
  })
);

vehicleCatalogRouter.get(
  "/models",
  requireAuth,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = modelsQuery.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid model lookup");
    const provider = getVehicleCatalogProvider();
    const records = await provider.listModels(parsed.data.year, parsed.data.makeId, parsed.data.make);
    res.json({ records, provider: provider.name });
  })
);

vehicleCatalogRouter.get(
  "/trims",
  requireAuth,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = trimsQuery.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid trim lookup");
    const provider = getVehicleCatalogProvider();
    const records = await provider.listTrims(
      parsed.data.year,
      parsed.data.makeId,
      parsed.data.model,
      parsed.data.make
    );
    res.json({ records, provider: provider.name });
  })
);

vehicleCatalogRouter.post(
  "/vin-lookup",
  requireAuth,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = vinLookupBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid VIN");
    const provider = getVehicleCatalogProvider();
    const record = await provider.decodeVin(parsed.data.vin);
    if (!record) {
      res.json({ record: null, provider: provider.name });
      return;
    }
    res.json({ record, provider: provider.name });
  })
);

