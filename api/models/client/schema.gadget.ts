import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "client" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "g_xUWt4FNBI0",
  fields: {
    address: { type: "string", storageKey: "8RwHTriPPznv" },
    appointments: {
      type: "hasMany",
      children: { model: "appointment", belongsToField: "client" },
      storageKey: "nm4z2101uMxt",
    },
    birthday: {
      type: "dateTime",
      includeTime: false,
      storageKey: "eZnPG9hR8hTX",
      searchIndex: false,
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "mSY5-tVFoECO",
    },
    city: { type: "string", storageKey: "etYDwJN8cVwB" },
    deletedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "7f4C3GKvhwRj",
      filterIndex: false,
      searchIndex: false,
    },
    email: { type: "string", storageKey: "QczhoytaIBNm" },
    firstName: {
      type: "string",
      validations: { required: true },
      storageKey: "cuA7Km1wr3Za",
    },
    internalNotes: {
      type: "string",
      storageKey: "-U-G-4qirEAl",
      filterIndex: false,
      searchIndex: false,
    },
    invoices: {
      type: "hasMany",
      children: { model: "invoice", belongsToField: "client" },
      storageKey: "T_YW-EeOXVKB",
    },
    lastName: {
      type: "string",
      validations: { required: true },
      storageKey: "ps2f2WtXbctO",
    },
    maintenanceReminders: {
      type: "hasMany",
      children: {
        model: "maintenanceReminder",
        belongsToField: "client",
      },
      storageKey: "jhM6QjMjvPtS",
    },
    marketingOptIn: {
      type: "boolean",
      default: true,
      storageKey: "nAnYR_CIUzQq",
      searchIndex: false,
    },
    notes: { type: "string", storageKey: "uTb5IuI-2VPu" },
    phone: { type: "string", storageKey: "gtL4vET7m-uR" },
    portalToken: {
      type: "string",
      validations: { unique: true },
      storageKey: "7qvakt4RGEEM",
      filterIndex: false,
      searchIndex: false,
    },
    preferredContact: {
      type: "enum",
      default: "email",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["email", "phone", "sms"],
      storageKey: "iGuDaQJjKGe8",
      searchIndex: false,
    },
    quotes: {
      type: "hasMany",
      children: { model: "quote", belongsToField: "client" },
      storageKey: "gts9LjN-jHU4",
    },
    source: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "walk-in",
        "referral",
        "google",
        "instagram",
        "facebook",
        "website",
        "other",
      ],
      storageKey: "cbvOS8OZ68Ij",
    },
    state: { type: "string", storageKey: "F4WKSA4l_94J" },
    tags: {
      type: "enum",
      acceptMultipleSelections: true,
      acceptUnlistedOptions: false,
      options: ["vip", "fleet", "wholesale", "retail"],
      storageKey: "30tWH92aetyB",
    },
    vehicles: {
      type: "hasMany",
      children: { model: "vehicle", belongsToField: "client" },
      storageKey: "f3rVYtmIhDfY",
    },
    zip: { type: "string", storageKey: "ZpHdZbAyaFT-" },
  },
};
