import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "service" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "akrz-t8VXxE1",
  comment:
    "Service model represents a single service offering belonging to a business. The primary display is the service name; secondary display shows key business attributes like price, duration, category, and active status.",
  fields: {
    active: {
      type: "boolean",
      default: true,
      storageKey: "8XhvVKyflDQn",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "Sa7lyuCH-q2b",
    },
    businessType: {
      type: "enum",
      acceptMultipleSelections: true,
      acceptUnlistedOptions: false,
      options: [
        "auto-detailing",
        "window-tinting",
        "wrap-ppf",
        "auto-body-collision",
        "tire-wheel-alignment",
        "performance-customization",
        "mobile-services",
        "general-automotive",
        "other",
      ],
      storageKey: "LUxzQmRjA3M_",
    },
    category: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "detailing",
        "tinting",
        "wrap",
        "ppf",
        "ceramic-coating",
        "paint-correction",
        "tires",
        "alignment",
        "wheels",
        "body-repair",
        "dent-removal",
        "glass",
        "performance",
        "audio-electronics",
        "lighting",
        "oil-change",
        "maintenance",
        "other",
      ],
      validations: { required: true },
      storageKey: "UZ0K5_joT39D",
    },
    deletedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "4Hd3bAjpvPFa",
      filterIndex: false,
      searchIndex: false,
    },
    description: { type: "string", storageKey: "dhQjezSt1ilL" },
    duration: {
      type: "number",
      decimals: 0,
      storageKey: "zi-mYs52y6-X",
    },
    isAddon: {
      type: "boolean",
      default: false,
      storageKey: "ca0XHTtE18lf",
      searchIndex: false,
    },
    name: {
      type: "string",
      validations: { required: true },
      storageKey: "ueIhVHRgu-e6",
    },
    price: {
      type: "number",
      decimals: 2,
      validations: { required: true },
      storageKey: "k1_DxlwZOSYI",
    },
    serviceInventoryItems: {
      type: "hasMany",
      children: {
        model: "serviceInventoryItem",
        belongsToField: "service",
      },
      storageKey: "7HqHv4arGaEe",
    },
    taxable: {
      type: "boolean",
      default: true,
      storageKey: "Xz4N2Pumh-rT",
      searchIndex: false,
    },
  },
};
