import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "backupSnapshot" model, go to https://strata.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "D6jkW9SkPGQT",
  comment:
    "The backupSnapshot model captures daily export backups for a business. It records when the backup was taken (label), its current state (status), per‑model record counts, a SHA‑256 checksum for integrity, the full serialized snapshot payload, any error message if the backup failed, and the timestamp when the backup completed. This allows admins to view, audit, and verify backups for their own business tenancy.",
  fields: {
    business: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "VPRs4d_83wnR",
    },
    checksum: {
      type: "string",
      validations: { regex: ["^[a-f0-9]{64}$"] },
      storageKey: "i34ZEKLmJaid",
      filterIndex: false,
      searchIndex: false,
    },
    completedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "4XLWNQQ7HLvI",
      searchIndex: false,
    },
    data: {
      type: "json",
      storageKey: "q53wOupfjNb7",
      filterIndex: false,
      searchIndex: false,
    },
    errorMessage: {
      type: "string",
      validations: { stringLength: { min: null, max: 2000 } },
      storageKey: "ZEmkwN5tUKpx",
      filterIndex: false,
      searchIndex: false,
    },
    label: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: 1, max: 255 },
      },
      storageKey: "mLSQpzn0kA7M",
    },
    recordCounts: {
      type: "json",
      storageKey: "XYdT3LOlHaeS",
      filterIndex: false,
      searchIndex: false,
    },
    status: {
      type: "enum",
      default: "running",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["running", "complete", "failed"],
      validations: { required: true },
      storageKey: "SVACHx194dpS",
    },
  },
};
