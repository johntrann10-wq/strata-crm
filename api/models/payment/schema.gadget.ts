import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "payment" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "Ee6074XCYKRp",
  comment:
    "Represents a payment made against an invoice, linking the payment to its invoice and the business (tenant) that received it.",
  fields: {
    amount: {
      type: "number",
      decimals: 2,
      validations: { required: true },
      storageKey: "eq3QgBbLEaoq",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "_s50dKaXqD1G",
    },
    idempotencyKey: {
      type: "string",
      storageKey: "7tqOLXy9rEq1",
      filterIndex: false,
      searchIndex: false,
    },
    invoice: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "invoice" },
      storageKey: "RVnYOB1T0ZTS",
    },
    method: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "cash",
        "card",
        "check",
        "venmo",
        "cashapp",
        "zelle",
        "other",
      ],
      validations: { required: true },
      storageKey: "jaXfxgeg9snW",
    },
    notes: {
      type: "string",
      storageKey: "xOjnOZSlFq6E",
      filterIndex: false,
    },
    paidAt: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "-jEs0iAtpDDz",
    },
    referenceNumber: { type: "string", storageKey: "_RCX2HFomcuq" },
    reversedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "Ts0XzDOc69KI",
      filterIndex: false,
      searchIndex: false,
    },
  },
};
