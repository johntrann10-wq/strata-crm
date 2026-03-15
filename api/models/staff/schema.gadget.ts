import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "staff" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "TO8FZUHJOWcl",
  comment:
    "Represents an individual staff member belonging to a business. Includes personal details, contact info, role within the company, employment status, and a color for calendar display. Permissions are scoped to the staff member's business tenant.",
  fields: {
    active: {
      type: "boolean",
      default: true,
      storageKey: "pF6FLGsCLKGS",
      searchIndex: false,
    },
    bio: {
      type: "string",
      validations: { stringLength: { min: null, max: 500 } },
      storageKey: "fqDEZyETRM9T",
      filterIndex: false,
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "sfvEIgChEFhL",
    },
    color: {
      type: "color",
      storageKey: "u3jkSi_xgS0f",
      searchIndex: false,
    },
    commissionRate: {
      type: "number",
      decimals: 2,
      validations: { numberRange: { min: 0, max: 100 } },
      storageKey: "BVg8-g7g-pow",
      searchIndex: false,
    },
    deletedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "6nm5D6FALmcl",
      filterIndex: false,
      searchIndex: false,
    },
    email: { type: "email", storageKey: "YeumMRqrx_qp" },
    firstName: {
      type: "string",
      validations: { required: true },
      storageKey: "udblEUEWUIC3",
    },
    hourlyRate: {
      type: "number",
      decimals: 2,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "vJYFh-ZbP-FT",
      searchIndex: false,
    },
    lastName: {
      type: "string",
      validations: { required: true },
      storageKey: "f12Bowc6EtVP",
    },
    location: {
      type: "belongsTo",
      parent: { model: "location" },
      storageKey: "CHST723B_lYc",
    },
    role: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "owner",
        "manager",
        "technician",
        "front-desk",
        "other",
      ],
      storageKey: "VIjWRQYZQtL4",
    },
    specialties: {
      type: "enum",
      acceptMultipleSelections: true,
      acceptUnlistedOptions: false,
      options: [
        "detailing",
        "tinting",
        "wrap",
        "ppf",
        "ceramic-coating",
        "paint-correction",
        "tires",
        "alignment",
        "body-repair",
        "glass",
        "performance",
        "audio-electronics",
        "other",
      ],
      storageKey: "JAnGTh43Trti",
    },
    user: {
      type: "belongsTo",
      validations: { unique: true },
      parent: { model: "user" },
      storageKey: "oNIFIzjnaqUW",
    },
  },
};
