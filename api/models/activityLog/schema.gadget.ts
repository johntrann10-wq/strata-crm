import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "activityLog" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "jkT4ArPwuBej",
  comment:
    "The activityLog model records all significant business events (appointments, invoices, client additions, etc.) for the recent‑activity feed. Each entry stores a machine‑readable `type`, a human‑readable `description`, optional `metadata` for linking, and references to the related business and other entities.",
  fields: {
    appointment: {
      type: "belongsTo",
      parent: { model: "appointment" },
      storageKey: "20gjtogTl50B",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "business" },
      storageKey: "3Ej9eKjIvEoF",
    },
    client: {
      type: "belongsTo",
      parent: { model: "client" },
      storageKey: "L8-TU46w70Ag",
    },
    description: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: null, max: 500 },
      },
      storageKey: "5sWnEi1sTu77",
    },
    invoice: {
      type: "belongsTo",
      parent: { model: "invoice" },
      storageKey: "DO4-jSbkXkoU",
    },
    metadata: {
      type: "json",
      storageKey: "WZ7FtZ0Rz-xU",
      filterIndex: false,
      searchIndex: false,
    },
    service: {
      type: "belongsTo",
      parent: { model: "service" },
      storageKey: "UKXCMDkr-urG",
    },
    type: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "appointment-created",
        "appointment-confirmed",
        "appointment-completed",
        "appointment-cancelled",
        "invoice-created",
        "invoice-sent",
        "invoice-paid",
        "payment-received",
        "client-added",
        "vehicle-added",
        "note-added",
        "reminder-sent",
        "review-requested",
        "client-updated",
        "client-deleted",
        "vehicle-created",
        "vehicle-updated",
        "vehicle-deleted",
        "appointment-updated",
        "appointment-status-changed",
        "invoice-updated",
        "invoice-voided",
        "invoice-deleted",
        "service-created",
        "service-updated",
        "service-deleted",
        "service-activated",
        "service-deactivated",
        "payment-deleted",
        "client-restored",
        "vehicle-restored",
        "service-restored",
        "invoice-unvoided",
        "payment-reversed",
        "record-reverted",
      ],
      validations: { required: true },
      storageKey: "qvz24Jxtw5xU",
    },
    vehicle: {
      type: "belongsTo",
      parent: { model: "vehicle" },
      storageKey: "uDRRRAn5xxpE",
    },
  },
};
