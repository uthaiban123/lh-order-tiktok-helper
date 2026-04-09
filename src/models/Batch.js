const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema(
  {
    batchType: {
      type: String,
      enum: ["income", "orders", "product_master"],
      required: true,
    },
    fileHash: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    uploadedBy: {
      type: String,
      default: "system",
      trim: true,
    },
    period: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["preview", "committed", "skipped"],
      default: "committed",
    },
    warningCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Batch", batchSchema);
