import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "appointment" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "liA5gaH7uM6_",
  comment:
    "The appointment model captures a scheduled job for a business, linking a client, vehicle, and staff together with its timing, status, and notes. It is used throughout the app to display upcoming and past jobs, filter by status, and provide quick access to key details.",
  fields: {
    appointmentServices: {
      type: "hasMany",
      children: {
        model: "appointmentService",
        belongsToField: "appointment",
      },
      storageKey: "L823fUdaKHMY",
    },
    assignedStaff: {
      type: "belongsTo",
      parent: { model: "staff" },
      storageKey: "T0XbbGBO00JO",
    },
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "Ak0vkABRMkRd",
    },
    cancelledAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "qF_1ShkE_I_l",
      filterIndex: false,
      searchIndex: false,
    },
    client: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "client" },
      storageKey: "b5P5Dmd9Ay0z",
    },
    completedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "Gsrhto7z_VpI",
      searchIndex: false,
    },
    depositAmount: {
      type: "number",
      default: 0,
      decimals: 2,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "BI_nwCfC_65D",
      searchIndex: false,
    },
    depositPaid: {
      type: "boolean",
      default: false,
      storageKey: "kDOBSliMgXY-",
      searchIndex: false,
    },
    endTime: {
      type: "dateTime",
      includeTime: true,
      storageKey: "eB9ZGHw_pUwr",
    },
    internalNotes: {
      type: "string",
      storageKey: "mx7_IMzrQixp",
      filterIndex: false,
      searchIndex: false,
    },
    inventoryDeductedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "6iEgC5-ho1pQ",
      filterIndex: false,
      searchIndex: false,
    },
    invoicedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "Gz4EUmIdYebU",
      filterIndex: false,
      searchIndex: false,
    },
    invoices: {
      type: "hasMany",
      children: { model: "invoice", belongsToField: "appointment" },
      storageKey: "ns5JZGV3zJmC",
    },
    isDropOff: {
      type: "boolean",
      default: false,
      storageKey: "k-LLow7vknck",
      searchIndex: false,
    },
    isMobile: {
      type: "boolean",
      default: false,
      storageKey: "QIMuk6djj16r",
      searchIndex: false,
    },
    location: {
      type: "belongsTo",
      parent: { model: "location" },
      storageKey: "fxN7kwOYJIkU",
    },
    mobileAddress: {
      type: "string",
      storageKey: "F67zlrQSHvg2",
      filterIndex: false,
      searchIndex: false,
    },
    notes: {
      type: "string",
      storageKey: "paRuYi3R6gpv",
      filterIndex: false,
      searchIndex: false,
    },
    paidAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "WahBxCMS_poU",
      searchIndex: false,
    },
    quotes: {
      type: "hasMany",
      children: { model: "quote", belongsToField: "appointment" },
      storageKey: "z9-88t-zgayW",
    },
    reminderSent: {
      type: "boolean",
      default: false,
      storageKey: "Ewx08oXBLLKz",
      searchIndex: false,
    },
    rescheduleCount: {
      type: "number",
      default: 0,
      decimals: 0,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "9YIq96iG3a3E",
      searchIndex: false,
    },
    reviewRequestSent: {
      type: "boolean",
      default: false,
      storageKey: "WpUz07lGKOuc",
      searchIndex: false,
    },
    startTime: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "bMq_i9GCTnVm",
    },
    status: {
      type: "enum",
      default: "scheduled",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no-show",
      ],
      validations: { required: true },
      storageKey: "6HhZiqlk46iG",
    },
    technicianNotes: {
      type: "string",
      validations: { stringLength: { min: null, max: 2000 } },
      storageKey: "nxIU3nK8XQIv",
      filterIndex: false,
      searchIndex: false,
    },
    title: {
      type: "string",
      validations: { stringLength: { min: null, max: 120 } },
      storageKey: "PA9kk_JJHhs8",
    },
    totalPrice: {
      type: "number",
      default: 0,
      decimals: 2,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "m-Ifjn7OYQmg",
      searchIndex: false,
    },
    vehicle: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "vehicle" },
      storageKey: "x94X129arWPf",
    },
    vehicleInspections: {
      type: "hasMany",
      children: {
        model: "vehicleInspection",
        belongsToField: "appointment",
      },
      storageKey: "3RGODcb1FSvf",
    },
  },
};
