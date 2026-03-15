import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "automationRule" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "S5aj2FfYJRTB",
  comment:
    "AutomationRule stores a single automation configuration per business, defining what event triggers the automation, whether it is active, any delay before execution, the custom message to send, and when it was last run. The rule is uniquely scoped by trigger type within a business and drives automated workflows such as reminders or notifications.",
  fields: {
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "c35yx9rB6xY0",
    },
    customMessage: {
      type: "string",
      storageKey: "O2NexvLvZZTC",
      filterIndex: false,
      searchIndex: false,
    },
    delayHours: {
      type: "number",
      default: 0,
      decimals: 0,
      validations: { numberRange: { min: 0, max: 168 } },
      storageKey: "BNW7P7Nci2a2",
      filterIndex: false,
      searchIndex: false,
    },
    enabled: {
      type: "boolean",
      default: false,
      storageKey: "GI7Qq2uv7K9k",
      searchIndex: false,
    },
    lastRunAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "p9evLSTMqIn1",
      searchIndex: false,
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
      validations: {
        required: true,
        unique: { scopeByField: "business" },
      },
      storageKey: "0XX022_FrmRk",
    },
  },
};
