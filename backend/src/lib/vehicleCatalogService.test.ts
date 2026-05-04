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
    expect(makes.some((entry) => entry.value === "Lexus")).toBe(true);
    expect(makes.some((entry) => entry.value === "Jeep")).toBe(true);
    expect(makes.some((entry) => entry.value === "Ram")).toBe(true);

    const toyota = makes.find((entry) => entry.value === "Toyota");
    expect(toyota).toBeDefined();

    const models = await provider.listModels(2024, toyota!.id, toyota!.value);
    expect(models.map((entry) => entry.value)).toContain("Camry");
    expect(models.map((entry) => entry.value)).toContain("RAV4");

    const trims = await provider.listTrims(2024, toyota!.id, "Camry", toyota!.value);
    expect(trims.map((entry) => entry.value)).toContain("SE");
    expect(trims.find((entry) => entry.value === "SE")?.bodyStyle).toBe("Sedan");
  });

  it("keeps the make list fast and clean while using NHTSA for extra models when available", async () => {
    const provider = getVehicleCatalogProvider();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/GetAllMakes?format=json")) {
        return new Response(
          JSON.stringify({
            Results: [
              { Make_ID: 441, Make_Name: "TESLA" },
              { Make_ID: 498, Make_Name: "RIVIAN" },
              { Make_ID: 492, Make_Name: "Oldsmobile" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

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
    expect(makes.some((entry) => entry.value === "Rivian")).toBe(true);
    expect(makes.some((entry) => entry.value === "Oldsmobile")).toBe(true);
    expect(makes.some((entry) => entry.value.toLowerCase().includes("tractor"))).toBe(false);
    expect(makes.filter((entry) => entry.value.toLowerCase() === "tesla")).toHaveLength(1);
    expect(vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input).includes("/GetAllMakes"))).toBe(false);

    const models = await provider.listModels(2024, tesla!.id, tesla!.value);
    expect(models.map((entry) => entry.value)).toContain("Cybertruck");
    expect(models.map((entry) => entry.value)).toContain("Model X");
  });

  it("includes larger curated coverage for popular automakers when live lookup is unavailable", async () => {
    const provider = getVehicleCatalogProvider();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const makes = await provider.listMakes(2024);
    for (const expectedMake of [
      "Lexus",
      "Acura",
      "Jeep",
      "Ram",
      "GMC",
      "Cadillac",
      "Genesis",
      "Rivian",
      "Polestar",
      "Jaguar",
      "Alfa Romeo",
      "Chrysler",
      "Maserati",
      "Ferrari",
      "Lamborghini",
      "McLaren",
      "Aston Martin",
      "Bentley",
      "Rolls-Royce",
      "Scion",
      "Pontiac",
      "Hummer",
    ]) {
      expect(makes.map((entry) => entry.value)).toContain(expectedMake);
    }

    const lexus = makes.find((entry) => entry.value === "Lexus");
    const jeep = makes.find((entry) => entry.value === "Jeep");
    const ram = makes.find((entry) => entry.value === "Ram");
    const ferrari = makes.find((entry) => entry.value === "Ferrari");
    const scion = makes.find((entry) => entry.value === "Scion");
    const oldsmobile = makes.find((entry) => entry.value === "Oldsmobile");
    expect(lexus).toBeDefined();
    expect(jeep).toBeDefined();
    expect(ram).toBeDefined();
    expect(ferrari).toBeDefined();
    expect(scion).toBeDefined();
    expect(oldsmobile).toBeDefined();

    await expect(provider.listModels(2024, lexus!.id, lexus!.value)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "RX" }), expect.objectContaining({ value: "GX" }), expect.objectContaining({ value: "RZ" })])
    );
    await expect(provider.listModels(2024, jeep!.id, jeep!.value)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "Wrangler" }), expect.objectContaining({ value: "Grand Cherokee" })])
    );
    await expect(provider.listModels(2024, ram!.id, ram!.value)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "1500" }), expect.objectContaining({ value: "2500" })])
    );
    await expect(provider.listModels(2024, ferrari!.id, ferrari!.value)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "Roma" }), expect.objectContaining({ value: "Purosangue" })])
    );
    await expect(provider.listModels(2024, scion!.id, scion!.value)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "FR-S" }), expect.objectContaining({ value: "tC" })])
    );
    await expect(provider.listModels(2024, oldsmobile!.id, oldsmobile!.value)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "Alero" }), expect.objectContaining({ value: "Bravada" })])
    );
  });
});
