import { describe, expect, it } from "vitest";
import { getVehicleCatalogProvider } from "./vehicleCatalogService.js";

describe("vehicle catalog provider", () => {
  it("returns a curated list of real-world makes and models", async () => {
    const provider = getVehicleCatalogProvider();

    const makes = await provider.listMakes(2024);
    expect(makes.some((entry) => entry.value === "Toyota")).toBe(true);
    expect(makes.some((entry) => entry.value === "Honda")).toBe(true);
    expect(makes.some((entry) => entry.value === "Tesla")).toBe(true);

    const toyota = makes.find((entry) => entry.value === "Toyota");
    expect(toyota).toBeDefined();

    const models = await provider.listModels(2024, toyota!.id, toyota!.value);
    expect(models.map((entry) => entry.value)).toContain("Camry");
    expect(models.map((entry) => entry.value)).toContain("RAV4");

    const trims = await provider.listTrims(2024, toyota!.id, "Camry", toyota!.value);
    expect(trims.map((entry) => entry.value)).toContain("SE");
    expect(trims.find((entry) => entry.value === "SE")?.bodyStyle).toBe("Sedan");
  });
});
