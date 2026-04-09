const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
      index: true,
    },
    orderId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    lineNo: {
      type: Number,
      required: true,
      min: 1,
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
    variation: String,
    qty: {
      type: Number,
      default: 0,
    },
    itemSubtotalAfterDiscount: {
      type: Number,
      default: 0,
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
  },
  {
    timestamps: true,
  }
);

orderItemSchema.index({ batchId: 1, orderId: 1, lineNo: 1 }, { unique: true });

module.exports = mongoose.model("OrderItem", orderItemSchema);
