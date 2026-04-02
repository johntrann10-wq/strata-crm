import { afterEach, describe, expect, it, vi } from "vitest";
import { getVehicleCatalogProvider } from "./vehicleCatalogService.js";

describe("vehicle catalog provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to the curated catalog when the live catalog is unavailable", async () => {
    const provider = getVehicleCatalogProvider();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

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

  it("keeps the make list fast while using the broader NHTSA catalog for models when available", async () => {
    const provider = getVehicleCatalogProvider();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/GetModelsForMakeIdYear/makeId/tesla/modelyear/2024?format=json")) {
        return new Response(
          JSON.stringify({ Results: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/GetModelsForMakeYear/make/Tesla/modelyear/2024?format=json")) {
        return new Response(
          JSON.stringify({
            Results: [
              { Model_ID: 101, Model_Name: "Cybertruck" },
              { Model_ID: 102, Model_Name: "Model X" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const makes = await provider.listMakes(2024);
    const tesla = makes.find((entry) => entry.value === "Tesla");
    expect(tesla).toBeDefined();
    expect(makes.some((entry) => entry.value === "Rivian")).toBe(false);

    const models = await provider.listModels(2024, tesla!.id, tesla!.value);
    expect(models.map((entry) => entry.value)).toContain("Cybertruck");
    expect(models.map((entry) => entry.value)).toContain("Model X");
  });
});
