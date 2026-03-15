import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "notificationLog" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "jhP2mJ_S-FAi",
  comment:
    "Tracks every outbound email sent by the system.  Each record stores what kind of notification was sent, its delivery status, the recipient, and any error or retry information.  The model is scoped to a business (tenant) and optionally linked to a client, allowing admins to audit communications and troubleshoot failed deliveries.",
  fields: {
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "zpb0l00WHJtI",
    },
    client: {
      type: "belongsTo",
      parent: { model: "client" },
      storageKey: "XQqQwxnDt5Z7",
    },
    errorMessage: {
      type: "string",
      validations: { stringLength: { min: null, max: 2000 } },
      storageKey: "_JGZAQh6Fvau",
      filterIndex: false,
      searchIndex: false,
    },
    htmlBody: {
      type: "string",
      storageKey: "l_2idTtUqSSj",
      filterIndex: false,
      searchIndex: false,
    },
    lastAttemptAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "T3iwBp2Qmw5E",
      searchIndex: false,
    },
    nextRetryAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "jMntgqsFUmpo",
    },
    recipientEmail: {
      type: "email",
      validations: { required: true },
      storageKey: "KTKFbapxhDKF",
    },
    relatedId: {
      type: "string",
      validations: { stringLength: { min: null, max: 64 } },
      storageKey: "x3_Zl0X9EAqh",
      searchIndex: false,
    },
    relatedModel: {
      type: "string",
      validations: { stringLength: { min: null, max: 100 } },
      storageKey: "5R_dDpmWHRUv",
    },
    retryCount: {
      type: "number",
      default: 0,
      decimals: 0,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "FBW0XdkxtZwm",
      searchIndex: false,
    },
    status: {
      type: "enum",
      default: "pending",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["pending", "sent", "failed", "retrying"],
      validations: { required: true },
      storageKey: "YRtSGmxo3rm9",
    },
    subject: {
      type: "string",
      validations: { stringLength: { min: null, max: 255 } },
      storageKey: "CuAtFL362_a2",
    },
    type: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "appointment_reminder",
        "maintenance_reminder",
        "lapsed_client_outreach",
        "invoice_sent",
        "job_completion",
        "review_request",
        "quote_sent",
        "quote_followup",
        "payment_receipt",
      ],
      validations: { required: true },
      storageKey: "b2IfQU1MS6GU",
    },
  },
};
