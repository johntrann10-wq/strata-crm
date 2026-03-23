import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "quoteLineItem" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "JCnxA4SIbjhh",
  comment:
    "Represents an individual line item on a Quote, capturing the description, quantity, pricing, taxability and optionally the associated Service. Each line is linked to a parent Quote (required) and may reference a Service for historical snapshots.",
  fields: {
    description: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: null, max: 500 },
      },
      storageKey: "OLWZD6iuzYpy",
    },
    quantity: {
      type: "number",
      default: 1,
      decimals: 0,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "QsybUOrA3niJ",
    },
    quote: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "quote" },
      storageKey: "kNFprwVG9f_B",
    },
    service: {
      type: "belongsTo",
      parent: { model: "service" },
      storageKey: "WV7Z2skOcW7e",
    },
    serviceSnapshot: {
      type: "json",
      storageKey: "M-RMUCt8iJO7",
      filterIndex: false,
      searchIndex: false,
    },
    taxable: {
      type: "boolean",
      default: true,
      storageKey: "i6M_XrKGQxoF",
      searchIndex: false,
    },
    total: {
      type: "number",
      decimals: 2,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "GmqYeCQEP9SN",
      searchIndex: false,
    },
    unitPrice: {
      type: "number",
      decimals: 2,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "_MPPgYsQrL7W",
      searchIndex: false,
    },
  },
};
