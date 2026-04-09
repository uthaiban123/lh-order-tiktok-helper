const mongoose = require("mongoose");

const incomeEntrySchema = new mongoose.Schema(
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
    settlementDate: {
      type: String,
      required: true,
      index: true,
    },
    orderSettledTime: String,
    entryType: {
      type: String,
      default: "Order",
      trim: true,
      index: true,
    },
    totalRevenue: {
      type: Number,
      default: 0,
    },
    totalSettlementAmount: {
      type: Number,
      default: 0,
    },
    subtotalAfterSellerDiscounts: {
      type: Number,
      default: 0,
    },
    sellerDiscounts: {
      type: Number,
      default: 0,
    },
    refundSubtotal: {
      type: Number,
      default: 0,
    },
    totalFees: {
      type: Number,
      default: 0,
    },
    transactionFee: {
      type: Number,
      default: 0,
    },
    tiktokShopCommissionFee: {
      type: Number,
      default: 0,
    },
    sellerShippingFee: {
      type: Number,
      default: 0,
    },
    affiliateCommission: {
      type: Number,
      default: 0,
    },
    liveSpecialsServiceFee: {
      type: Number,
      default: 0,
    },
    commerceGrowthFee: {
      type: Number,
      default: 0,
    },
    infrastructureFee: {
      type: Number,
      default: 0,
    },
    totalAdjustments: {
      type: Number,
      default: 0,
    },
    withdrawalAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

incomeEntrySchema.index(
  { batchId: 1, orderId: 1, settlementDate: 1 },
  { unique: true }
);

incomeEntrySchema.index(
  { orderId: 1, settlementDate: 1, entryType: 1 },
  { unique: true }
);

module.exports = mongoose.model("IncomeEntry", incomeEntrySchema);
