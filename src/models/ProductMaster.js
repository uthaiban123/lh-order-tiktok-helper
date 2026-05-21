const mongoose = require("mongoose");

const productMasterSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      index: true,
    },
    productId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    skuId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    sellerSku: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    manualSellerSku: {
      type: String,
      default: "",
      trim: true,
    },
    manualSellerSkuEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    variationValue: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      default: "",
      trim: true,
    },
    brand: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: Number,
      default: 0,
    },
    quantity: {
      type: Number,
      default: 0,
    },
    isSellerSkuUnique: {
      type: Boolean,
      default: true,
      index: true,
    },
    duplicateSellerSkuCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    baseProductCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    packMultiplier: {
      type: Number,
      default: 1,
      min: 1,
    },
    matchKey: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    canonicalPrice: {
      type: Number,
      default: 0,
    },
    priceOverrides: {
      tiktok: { type: Number },
      shopee: { type: Number },
      lazada: { type: Number },
    },
    platforms: {
      tiktok: {
        productId: String,
        skuId: String,
        sellerSku: String,
        productName: String,
        variationValue: String,
        price: Number,
        quantity: Number,
        linkStatus: {
          type: String,
          enum: ["native", "linked", "unlinked"],
          default: "native",
        },
        lastImportedAt: Date,
      },
      shopee: {
        productId: String,
        variationId: String,
        productName: String,
        variationName: String,
        parentSku: String,
        sellerSku: String,
        price: Number,
        stock: Number,
        linkStatus: {
          type: String,
          enum: ["unlinked", "suggested", "linked", "manual"],
          default: "unlinked",
        },
        matchScore: Number,
        matchedBy: String,
        linkedAt: Date,
        lastImportedAt: Date,
      },
      lazada: {
        productId: String,
        lazadaSkuId: String,
        shopSku: String,
        productName: String,
        price: Number,
        quantity: Number,
        linkStatus: {
          type: String,
          enum: ["unlinked", "suggested", "linked", "manual"],
          default: "unlinked",
        },
        matchScore: Number,
        matchedBy: String,
        linkedAt: Date,
        lastImportedAt: Date,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ProductMaster", productMasterSchema);
