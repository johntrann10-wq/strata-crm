import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "quote" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "eAkDPRhFS3WS",
  fields: {
    acceptToken: {
      type: "string",
      validations: { unique: true },
      storageKey: "bIIp-Z4-m2Gl",
    },
    acceptedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "o9pRFoApacoK",
    },
    appointment: {
      type: "belongsTo",
      parent: { model: "appointment" },
      storageKey: "pu4zspuZ-vxq",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "nJEq0_i4_u_D",
    },
    client: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "client" },
      storageKey: "9gWYrYQXICPn",
    },
    expiresAt: {
      type: "dateTime",
      includeTime: false,
      storageKey: "B5O_OGvPtrYs",
    },
    followUpSentAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "aB6YQjDGieQy",
      searchIndex: false,
    },
    lineItems: {
      type: "hasMany",
      children: { model: "quoteLineItem", belongsToField: "quote" },
      storageKey: "n2Pz-gvEE4R_",
    },
    notes: { type: "string", storageKey: "HDYhola0s2tG" },
    sentAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "HNErJna_lM01",
    },
    status: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["draft", "sent", "accepted", "declined", "expired"],
      validations: { required: true },
      storageKey: "5kOAXLOttC0p",
    },
    subtotal: { type: "number", storageKey: "r2jBeLFz3aGz" },
    taxAmount: { type: "number", storageKey: "f3u56kdeUnz0" },
    taxRate: { type: "number", storageKey: "WZtGSFIef5pE" },
    total: { type: "number", storageKey: "nxlU_CBS75I0" },
    vehicle: {
      type: "belongsTo",
      parent: { model: "vehicle" },
      storageKey: "1QVTlM4cmPXn",
    },
  },
};
