import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "vehicle" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "aSS5nEy9TuUw",
  fields: {
    appointments: {
      type: "hasMany",
      children: { model: "appointment", belongsToField: "vehicle" },
      storageKey: "x8Jsj6AaHq6s",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "-ypkl0y3Ew-E",
    },
    client: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "client" },
      storageKey: "daRsOycK5gBr",
    },
    color: {
      type: "string",
      validations: { stringLength: { min: null, max: 50 } },
      storageKey: "G6C-h_4czd4e",
    },
    deletedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "lvh3fRZRKKgq",
      filterIndex: false,
      searchIndex: false,
    },
    filmType: {
      type: "string",
      validations: { stringLength: { min: null, max: 120 } },
      storageKey: "CYHtI7Jld6Hv",
      filterIndex: false,
      searchIndex: false,
    },
    insuranceAdjuster: {
      type: "string",
      validations: { stringLength: { min: null, max: 120 } },
      storageKey: "dIyfddRrLjJi",
      filterIndex: false,
      searchIndex: false,
    },
    insuranceClaim: {
      type: "string",
      validations: { stringLength: { min: null, max: 100 } },
      storageKey: "NvloF_jrkiB8",
    },
    insuranceCompany: {
      type: "string",
      validations: { stringLength: { min: null, max: 255 } },
      storageKey: "gek6DryEz6Zz",
    },
    invoices: {
      type: "hasMany",
      children: { model: "invoice", belongsToField: "vehicle" },
      storageKey: "GFhcuS2E46nD",
    },
    lastServiceDate: {
      type: "dateTime",
      includeTime: true,
      storageKey: "r22ZcDpC21By",
      searchIndex: false,
    },
    licensePlate: {
      type: "string",
      validations: { stringLength: { min: null, max: 32 } },
      storageKey: "-yajH4099RPF",
    },
    maintenanceReminders: {
      type: "hasMany",
      children: {
        model: "maintenanceReminder",
        belongsToField: "vehicle",
      },
      storageKey: "AOQU1s2uQ0iZ",
    },
    make: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: null, max: 100 },
      },
      storageKey: "imxHPrvdVW0Y",
    },
    mileage: {
      type: "number",
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "MkNSXhOPirFm",
    },
    model: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: null, max: 100 },
      },
      storageKey: "EkvBmWOjV0hM",
    },
    nextServiceDue: {
      type: "dateTime",
      includeTime: true,
      storageKey: "kOBi_bPOxrYF",
      searchIndex: false,
    },
    notes: { type: "string", storageKey: "40f9s-MptqAn" },
    paintType: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "stock",
        "custom",
        "wrapped",
        "ppf",
        "ceramic-coated",
        "matte",
        "satin",
      ],
      storageKey: "ziHlOE1eDko0",
    },
    photo: {
      type: "file",
      allowPublicAccess: true,
      storageKey: "7uNYpytVnUcR",
    },
    purchaseYear: {
      type: "number",
      decimals: 0,
      validations: { numberRange: { min: 1900, max: null } },
      storageKey: "OZ_PdMeDEaGr",
      searchIndex: false,
    },
    tintPercentage: {
      type: "number",
      decimals: 0,
      storageKey: "ul9o0IvUlqNA",
      filterIndex: false,
      searchIndex: false,
    },
    trim: {
      type: "string",
      validations: { stringLength: { min: null, max: 100 } },
      storageKey: "5vUF1a2Cf-ZB",
    },
    vin: {
      type: "string",
      validations: { stringLength: { min: null, max: 32 } },
      storageKey: "j1pMaSZ1FmCY",
    },
    warrantyNotes: {
      type: "string",
      storageKey: "Dr0zbSm5vraV",
      filterIndex: false,
      searchIndex: false,
    },
    year: {
      type: "number",
      decimals: 0,
      validations: { numberRange: { min: 1886, max: null } },
      storageKey: "blcpxxkGFjai",
    },
  },
};
