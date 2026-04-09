const mongoose = require("mongoose");

const orderHeaderSchema = new mongoose.Schema(
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
    orderStatus: String,
    orderSubstatus: String,
    createdTime: String,
    paidTime: String,
    deliveredTime: String,
    orderAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

orderHeaderSchema.index({ batchId: 1, orderId: 1 }, { unique: true });

module.exports = mongoose.model("OrderHeader", orderHeaderSchema);
