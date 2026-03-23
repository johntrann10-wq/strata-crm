import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "invoiceLineItem" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "qktneDZ8wAI0",
  comment:
    "Represents a single line item on an invoice, capturing the charge description, quantity, unit price, calculated total and taxability. Linked to an Invoice (required) and optionally to a Service for predefined line items.",
  fields: {
    description: {
      type: "string",
      validations: { required: true },
      storageKey: "tzkQxyA1X9-F",
    },
    invoice: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "invoice" },
      storageKey: "IbejP7dBip09",
    },
    quantity: {
      type: "number",
      default: 1,
      decimals: 0,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "pF3eyTSfHoIW",
    },
    service: {
      type: "belongsTo",
      parent: { model: "service" },
      storageKey: "ikQP42MshcOi",
    },
    serviceSnapshot: {
      type: "json",
      storageKey: "kpDAvzPOh0JT",
      filterIndex: false,
      searchIndex: false,
    },
    taxable: {
      type: "boolean",
      default: true,
      storageKey: "4wej44nnQaM9",
      searchIndex: false,
    },
    total: {
      type: "number",
      decimals: 2,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "vICLEg3dif6r",
      searchIndex: false,
    },
    unitPrice: {
      type: "number",
      decimals: 2,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "XmMbWTRzyNVQ",
      searchIndex: false,
    },
  },
};
