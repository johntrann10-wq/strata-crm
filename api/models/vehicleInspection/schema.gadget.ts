import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "vehicleInspection" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "7Yw2SN5XW86y",
  comment:
    "Stores the pre‑inspection checklist a technician completes before beginning work on an appointment. Links to the appointment, vehicle, and business, captures the detailed checklist JSON, an overall condition rating, mileage at inspection, technician name, completion timestamp, and any free‑form notes.",
  fields: {
    appointment: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "appointment" },
      storageKey: "VePnOKL30ahs",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "24u4NQmPk-_T",
    },
    checklist: {
      type: "json",
      storageKey: "ufdD8jZLQetF",
      filterIndex: false,
      searchIndex: false,
    },
    completedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "zxLv8iS2gjL_",
      filterIndex: false,
      searchIndex: false,
    },
    mileageAtInspection: {
      type: "number",
      decimals: 0,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "4MRAeYVpKZvu",
      searchIndex: false,
    },
    notes: {
      type: "string",
      storageKey: "pkAkDWPLEu8_",
      filterIndex: false,
      searchIndex: false,
    },
    overallCondition: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["excellent", "good", "fair", "poor"],
      storageKey: "kljd3DK_MxMJ",
      filterIndex: false,
      searchIndex: false,
    },
    technicianName: {
      type: "string",
      validations: { stringLength: { min: null, max: 120 } },
      storageKey: "QzgBNvsYl0i-",
      filterIndex: false,
      searchIndex: false,
    },
    vehicle: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "vehicle" },
      storageKey: "MkKwQTUiBzWi",
    },
  },
};
