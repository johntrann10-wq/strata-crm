import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "systemErrorLog" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "PVM3NU8bDggs",
  comment:
    "System error log records backend failures for audit and troubleshooting, scoped to a business. Includes severity, category, descriptive message, context, and resolution status.",
  fields: {
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "PHGPrSCg_6ip",
    },
    category: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "email",
        "inventory",
        "payment",
        "automation",
        "scheduling",
        "data-integrity",
        "other",
      ],
      validations: { required: true },
      storageKey: "itkYUGlMwfw2",
      searchIndex: false,
    },
    context: {
      type: "json",
      storageKey: "g654moCNNyXE",
      filterIndex: false,
      searchIndex: false,
    },
    message: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: null, max: 2000 },
      },
      storageKey: "-DdBY7dMGrG7",
      filterIndex: false,
      searchIndex: false,
    },
    resolved: {
      type: "boolean",
      default: false,
      storageKey: "Q7INiaKZ8NhH",
      searchIndex: false,
    },
    resolvedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "Ct3e1IwTdcxp",
      searchIndex: false,
    },
    severity: {
      type: "enum",
      default: "error",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["warning", "error", "critical"],
      validations: { required: true },
      storageKey: "0D5EEknjtYXJ",
    },
  },
};
