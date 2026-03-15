import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "user" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "DataModel-AppAuth-User",
  fields: {
    business: {
      type: "hasOne",
      child: { model: "business", belongsToField: "owner" },
      storageKey: "yFg38gTpaoCd",
    },
    email: {
      type: "email",
      validations: { required: true, unique: true },
      storageKey: "1s_XFCkyiUFR",
    },
    emailVerificationToken: {
      type: "string",
      storageKey: "KRBvpIpWD7oz",
    },
    emailVerificationTokenExpiration: {
      type: "dateTime",
      includeTime: true,
      storageKey: "tqiVDxMHUAoz",
    },
    emailVerified: {
      type: "boolean",
      default: false,
      storageKey: "Zkh2OFMbXQX2",
    },
    firstName: { type: "string", storageKey: "mHvDmScLOwUB" },
    googleImageUrl: { type: "url", storageKey: "z8K9wF11-VYS" },
    googleProfileId: { type: "string", storageKey: "uUes0uLSq-Ks" },
    lastName: { type: "string", storageKey: "Yk8ZyVvk900k" },
    lastSignedIn: {
      type: "dateTime",
      includeTime: true,
      storageKey: "J0LC_TpQJY1n",
    },
    password: {
      type: "password",
      validations: { strongPassword: true },
      storageKey: "kuKGabFO6sjI",
    },
    profilePicture: {
      type: "file",
      allowPublicAccess: true,
      storageKey: "jUklRkg5fhQC",
    },
    resetPasswordToken: {
      type: "string",
      storageKey: "XWnEm5uDcrGG",
    },
    resetPasswordTokenExpiration: {
      type: "dateTime",
      includeTime: true,
      storageKey: "t05lNHxTMths",
    },
    roles: {
      type: "roleList",
      default: ["unauthenticated"],
      storageKey: "PpGbLiryHJKv",
    },
  },
};
