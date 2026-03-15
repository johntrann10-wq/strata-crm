import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "location" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "W1tyiLp2fjFa",
  comment:
    "Represents a physical shop location belonging to a business. Includes required name and optional address, phone, timezone, and active status. Used for scheduling and contact; business field enforces tenancy but is hidden from UI.",
  fields: {
    active: {
      type: "boolean",
      default: true,
      storageKey: "BmbxuTs4wDUZ",
    },
    address: {
      type: "string",
      validations: { stringLength: { min: null, max: 500 } },
      storageKey: "CnYCgu8aHwdq",
    },
    appointments: {
      type: "hasMany",
      children: { model: "appointment", belongsToField: "location" },
      storageKey: "UkkwIZTQmYds",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "7hKx3RnnoM8K",
    },
    name: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: 1, max: 255 },
      },
      storageKey: "n4jp9eYhuu6h",
    },
    phone: {
      type: "string",
      validations: { stringLength: { min: null, max: 50 } },
      storageKey: "bUrUSuHQmT3C",
    },
    staff: {
      type: "hasMany",
      children: { model: "staff", belongsToField: "location" },
      storageKey: "6YAwhyXRBzA8",
    },
    timezone: {
      type: "string",
      validations: { stringLength: { min: null, max: 100 } },
      storageKey: "E6N50k9Ru8Co",
      searchIndex: false,
    },
  },
};
