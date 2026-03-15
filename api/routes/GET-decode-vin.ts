import { RouteHandler } from "gadget-server";

interface NHTSAResult {
  Variable: string;
  Value: string | null;
}

interface NHTSAResponse {
  Results: NHTSAResult[];
}

const route: RouteHandler<{ Querystring: { vin?: string } }> = async ({ request, reply }) => {
  const { vin } = request.query;

  if (!vin || vin.length < 17) {
    return reply.code(400).send({ error: "VIN must be 17 characters" });
  }

  let nhtsaData: NHTSAResponse;

  try {
    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
    nhtsaData = (await response.json()) as NHTSAResponse;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return reply.code(502).send({ error: "VIN lookup failed", details: errorMessage });
  }

  const results = nhtsaData.Results ?? [];

  const isValid = (value: string | null | undefined): value is string =>
    value !== null && value !== undefined && value !== "" && value !== "Not Applicable";

  const findValue = (variable: string): string | null => {
    const found = results.find((r) => r.Variable === variable);
    return found && isValid(found.Value) ? found.Value : null;
  };

  const yearRaw = findValue("Model Year");
  const makeRaw = findValue("Make");
  const modelRaw = findValue("Model");
  const trimRaw = findValue("Trim");
  const engineRaw = findValue("Displacement (L)");
  const bodyStyleRaw = findValue("Body Class");
  const driveTypeRaw = findValue("Drive Type");
  const fuelTypeRaw = findValue("Fuel Type - Primary");
  const manufacturerNameRaw = findValue("Manufacturer Name");

  const vehicleData: Record<string, unknown> = { success: true, vin };

  if (yearRaw !== null) {
    const parsed = parseInt(yearRaw, 10);
    if (!isNaN(parsed)) vehicleData.year = parsed;
  }
  if (makeRaw !== null) vehicleData.make = makeRaw;
  if (modelRaw !== null) vehicleData.model = modelRaw;
  if (trimRaw !== null) vehicleData.trim = trimRaw;
  if (engineRaw !== null) vehicleData.engine = `${engineRaw}L`;
  if (bodyStyleRaw !== null) vehicleData.bodyStyle = bodyStyleRaw;
  if (driveTypeRaw !== null) vehicleData.driveType = driveTypeRaw;
  if (fuelTypeRaw !== null) vehicleData.fuelType = fuelTypeRaw;
  if (manufacturerNameRaw !== null) vehicleData.manufacturerName = manufacturerNameRaw;

  return reply.send(vehicleData);
};

route.options = {
  cors: {
    origin: true,
  },
};

export default route;