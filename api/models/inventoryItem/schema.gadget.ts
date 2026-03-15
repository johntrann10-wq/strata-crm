import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "inventoryItem" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "kOth8WcBSFlJ",
  comment:
    "Represents a product or supply belonging to a specific business, used for inventory tracking, stock management, and reorder workflows.",
  fields: {
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "u-3kVdkYoAiV",
    },
    category: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "coating",
        "film",
        "chemical",
        "tool",
        "hardware",
        "other",
      ],
      storageKey: "wuP7XCxorJ9D",
    },
    costPerUnit: {
      type: "number",
      decimals: 2,
      storageKey: "rzRGGU75P356",
    },
    description: { type: "string", storageKey: "Brg92gYlUdR3" },
    name: {
      type: "string",
      validations: { required: true },
      storageKey: "DpLz41i1m6j2",
    },
    quantity: {
      type: "number",
      default: 0,
      decimals: 0,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "7AykxzH0dCXt",
    },
    reorderThreshold: {
      type: "number",
      decimals: 0,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "gLzk292lzGAA",
    },
    serviceInventoryItems: {
      type: "hasMany",
      children: {
        model: "serviceInventoryItem",
        belongsToField: "inventoryItem",
      },
      storageKey: "ze57bD3Itl2j",
    },
    sku: { type: "string", storageKey: "9v0BOsKo8SIi" },
    supplier: { type: "string", storageKey: "uN5IChhyHtmq" },
    unit: { type: "string", storageKey: "DOZk9DoPFtYq" },
  },
};
