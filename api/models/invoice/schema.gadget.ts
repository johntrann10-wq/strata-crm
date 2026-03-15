import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "invoice" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "ieRhelYDHuCQ",
  fields: {
    appointment: {
      type: "belongsTo",
      parent: { model: "appointment" },
      storageKey: "u1e8JuOJGhC1",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "d_DBnffL41yx",
    },
    client: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "client" },
      storageKey: "w0i9CWF1ZUJ_",
    },
    discountAmount: {
      type: "number",
      decimals: 2,
      storageKey: "1WHbth8XoHZ-",
    },
    dueDate: {
      type: "dateTime",
      includeTime: true,
      storageKey: "rbO6yNJf8RGZ",
    },
    invoiceNumber: {
      type: "string",
      validations: { unique: true },
      storageKey: "PyvPTdI0JLv4",
    },
    lineItems: {
      type: "hasMany",
      children: {
        model: "invoiceLineItem",
        belongsToField: "invoice",
      },
      storageKey: "cT1abeqIjIfu",
    },
    notes: { type: "string", storageKey: "JDCNd0a3bw15" },
    paidAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "o84cwF_Yt4hd",
    },
    payments: {
      type: "hasMany",
      children: { model: "payment", belongsToField: "invoice" },
      storageKey: "zU3_i_kHsh1R",
    },
    status: {
      type: "enum",
      default: "draft",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["draft", "sent", "paid", "partial", "void"],
      validations: { required: true },
      storageKey: "CZozp5M7j3VH",
    },
    subtotal: { type: "number", storageKey: "RvljsubjrM0d" },
    taxAmount: { type: "number", storageKey: "JOcmRa1S_aSz" },
    taxRate: { type: "number", storageKey: "c_7YElkeJOXQ" },
    total: { type: "number", storageKey: "ZRXW8GyPKXvb" },
  },
};
