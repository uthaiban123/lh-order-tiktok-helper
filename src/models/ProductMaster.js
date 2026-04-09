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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ProductMaster", productMasterSchema);
