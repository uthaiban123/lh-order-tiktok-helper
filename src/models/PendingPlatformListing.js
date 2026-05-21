const mongoose = require("mongoose");

const pendingPlatformListingSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["shopee", "lazada"],
      required: true,
      index: true,
    },
    externalKey: {
      type: String,
      required: true,
      trim: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      index: true,
    },
    productName: { type: String, default: "", trim: true },
    variationName: { type: String, default: "", trim: true },
    matchKey: { type: String, default: "", trim: true, index: true },
    price: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    platformData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["pending", "suggested", "linked", "skipped"],
      default: "pending",
      index: true,
    },
    suggestedProductMasterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductMaster",
      index: true,
    },
    suggestedSkuId: { type: String, default: "", trim: true },
    matchScore: { type: Number, default: 0, min: 0, max: 100 },
    linkedProductMasterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductMaster",
      index: true,
    },
    linkedAt: { type: Date },
    matchedBy: {
      type: String,
      enum: ["name", "manual", "csv"],
      default: "name",
    },
  },
  { timestamps: true }
);

pendingPlatformListingSchema.index({ platform: 1, externalKey: 1 }, { unique: true });

module.exports = mongoose.model("PendingPlatformListing", pendingPlatformListingSchema);
