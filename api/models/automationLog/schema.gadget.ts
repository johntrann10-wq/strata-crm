import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "automationLog" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "mZiKv0Km2LG4",
  fields: {
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "_VEeFO7e8Bq3",
    },
    nextRetryAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "n4WSwbKg-5T7",
      searchIndex: false,
    },
    reason: { type: "string", storageKey: "RKKGHbAEEwPI" },
    recipientEmail: { type: "string", storageKey: "9ftw0eoxi2_D" },
    recipientName: { type: "string", storageKey: "DffLj3vXrd-N" },
    relatedRecordId: { type: "string", storageKey: "4_D38wHyhbtX" },
    retryCount: {
      type: "number",
      default: 0,
      decimals: 0,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "K1WT2y14ot5J",
      searchIndex: false,
    },
    rule: {
      type: "belongsTo",
      parent: { model: "automationRule" },
      storageKey: "yxKYrFZZ4xmU",
    },
    status: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["sent", "skipped", "failed"],
      validations: { required: true },
      storageKey: "dD3eG4lY1MuL",
    },
    triggerType: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "job-completed",
        "invoice-unpaid",
        "appointment-reminder",
        "service-interval",
        "lapsed-client",
      ],
      validations: { required: true },
      storageKey: "dkkDz2g_FNFh",
    },
  },
};
