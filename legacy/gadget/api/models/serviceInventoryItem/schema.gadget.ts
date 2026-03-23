import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "serviceInventoryItem" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "ZgrXsj1fgxCP",
  comment:
    "Join model linking a Service to an InventoryItem, storing the quantity of the inventory item used when the service is performed. Enforced per business for tenancy.",
  fields: {
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "cA83qG3r4clS",
    },
    inventoryItem: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "inventoryItem" },
      storageKey: "h27fwx03-L71",
    },
    quantityUsed: {
      type: "number",
      default: 1,
      decimals: 2,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "cEnHnoRp65vM",
      searchIndex: false,
    },
    service: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "service" },
      storageKey: "HefDv-Ih66dR",
    },
  },
};
