import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "appointmentPhoto" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "sPljsEPouAPo",
  fields: {
    appointment: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "appointment" },
      storageKey: "jcRa9vnKwfWc",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "ErwRHu8DYurR",
    },
    caption: {
      type: "string",
      validations: { stringLength: { min: null, max: 255 } },
      storageKey: "GOuw1Ol2XfHw",
    },
    file: {
      type: "file",
      allowPublicAccess: true,
      validations: { required: true },
      storageKey: "XQWEQXH6GqfE",
    },
    type: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["before", "after", "inspection"],
      validations: { required: true },
      storageKey: "NLlbL9_k9cs4",
    },
  },
};
