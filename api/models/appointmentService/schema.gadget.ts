import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "appointmentService" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "_t6zdxX9sOeT",
  fields: {
    appointment: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "appointment" },
      storageKey: "F4RP21FB4QuS",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "jnYNT4zjuIDu",
    },
    duration: {
      type: "number",
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "fpoKoVGWln7z",
    },
    notes: { type: "string", storageKey: "LNAPKxF0JpHh" },
    price: {
      type: "number",
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "09YDJluSQ-RS",
    },
    service: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "service" },
      storageKey: "1Put0vTBNonl",
    },
    serviceDescription: {
      type: "string",
      validations: { stringLength: { min: null, max: 1000 } },
      storageKey: "jdZFJIA8LYJ7",
      filterIndex: false,
      searchIndex: false,
    },
    serviceName: {
      type: "string",
      validations: { stringLength: { min: null, max: 120 } },
      storageKey: "1uBvxVXt8Qu9",
      filterIndex: false,
      searchIndex: false,
    },
  },
};
