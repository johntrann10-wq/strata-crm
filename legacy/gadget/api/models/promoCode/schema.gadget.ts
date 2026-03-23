import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "promoCode" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "YnPnFytQ9D09",
  fields: {
    active: {
      type: "boolean",
      default: true,
      storageKey: "JqvUD0aU8t1J",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "business" },
      storageKey: "ihDHj4epz_zx",
    },
    code: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: 1, max: 64 },
        unique: { scopeByField: "business" },
      },
      storageKey: "JMSC8YPepgtt",
    },
    discountType: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["percentage", "flat"],
      validations: { required: true },
      storageKey: "cuXBl6PWkazU",
    },
    discountValue: {
      type: "number",
      decimals: 2,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "8TklrAdfvvps",
    },
    expiresAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "C7sfYMX1cS5x",
    },
    maxUses: {
      type: "number",
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "1Z8bQjg04l0h",
    },
    minimumJobValue: {
      type: "number",
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "2LDI11cZUIK0",
    },
    timesUsed: {
      type: "number",
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "7M6iC0YmGVIi",
    },
  },
};
