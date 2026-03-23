import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "maintenanceReminder" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "ljJlkXKTUXAn",
  comment:
    "Represents an automated maintenance reminder tied to a business, client, and optionally a vehicle or appointment. Stores the reminder type, title, message, scheduled due date, and sent status. Used to schedule and track follow‑up notifications like ceramic coating re‑checks or tire rotations.",
  fields: {
    appointment: {
      type: "belongsTo",
      parent: { model: "appointment" },
      storageKey: "7PpucHJbAdGl",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "RKdIqLHCvQeV",
    },
    client: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "client" },
      storageKey: "z8kmgMfV4YWY",
    },
    dueDate: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "_P4Ime_hast5",
    },
    message: {
      type: "string",
      storageKey: "mUKpk3d0d-4X",
      filterIndex: false,
    },
    sent: {
      type: "boolean",
      default: false,
      storageKey: "ZGdZvTLICO9E",
      searchIndex: false,
    },
    sentAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "O0ufrbDpYOnc",
      searchIndex: false,
    },
    title: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: null, max: 255 },
      },
      storageKey: "IDt_vr03Zo-G",
    },
    type: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "ceramic-recheck",
        "ppf-inspection",
        "detail-followup",
        "tire-rotation",
        "oil-change",
        "custom",
      ],
      validations: { required: true },
      storageKey: "UuG9v0pwwAlr",
    },
    vehicle: {
      type: "belongsTo",
      parent: { model: "vehicle" },
      storageKey: "7Wfeycp1GKx_",
    },
  },
};
