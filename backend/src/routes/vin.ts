import { Router, Request, Response } from "express";

export const vinRouter = Router();

/** GET /api/decode-vin?vin=... — simple stub so frontend VIN decoding never crashes. */
vinRouter.get("/decode-vin", async (req: Request, res: Response) => {
  const vin = String(req.query.vin ?? "").trim();
  if (!vin) {
    res.json({ error: "VIN is required" });
    return;
  }
  if (vin.length !== 17) {
    res.json({ error: "VIN must be 17 characters" });
    return;
  }
  // For launch, we do not call an external VIN API; just return a no-op response.
  res.json({ error: "VIN decoding is not configured yet." });
});

