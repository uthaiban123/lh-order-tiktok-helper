const IncomeEntry = require("../models/IncomeEntry");
const OrderItem = require("../models/OrderItem");
const ProductMaster = require("../models/ProductMaster");

function buildFinanceProjectStage() {
  return {
    _id: null,
    settledOrders: { $sum: 1 },
    totalRevenue: { $sum: "$totalRevenue" },
    totalSettlementAmount: { $sum: "$totalSettlementAmount" },
    subtotalAfterSellerDiscounts: { $sum: "$subtotalAfterSellerDiscounts" },
    sellerDiscounts: { $sum: "$sellerDiscounts" },
    refundSubtotal: { $sum: "$refundSubtotal" },
    totalFees: { $sum: "$totalFees" },
    transactionFee: { $sum: "$transactionFee" },
    tiktokShopCommissionFee: { $sum: "$tiktokShopCommissionFee" },
    sellerShippingFee: { $sum: "$sellerShippingFee" },
    affiliateCommission: { $sum: "$affiliateCommission" },
    liveSpecialsServiceFee: { $sum: "$liveSpecialsServiceFee" },
    commerceGrowthFee: { $sum: "$commerceGrowthFee" },
    infrastructureFee: { $sum: "$infrastructureFee" },
    totalAdjustments: { $sum: "$totalAdjustments" },
    withdrawalAmount: { $sum: "$withdrawalAmount" },
  };
}

async function buildSummary({ settlementDate, month }) {
  const match = settlementDate
    ? { settlementDate }
    : { settlementDate: { $regex: `^${month}` } };

  const financeSummaryRows = await IncomeEntry.aggregate([
    { $match: match },
    { $group: buildFinanceProjectStage() },
  ]);

  const financeSummary = financeSummaryRows[0] || {
    settledOrders: 0,
    totalRevenue: 0,
    totalSettlementAmount: 0,
    subtotalAfterSellerDiscounts: 0,
    sellerDiscounts: 0,
    refundSubtotal: 0,
    totalFees: 0,
    transactionFee: 0,
    tiktokShopCommissionFee: 0,
    sellerShippingFee: 0,
    affiliateCommission: 0,
    liveSpecialsServiceFee: 0,
    commerceGrowthFee: 0,
    infrastructureFee: 0,
    totalAdjustments: 0,
    withdrawalAmount: 0,
  };

  const orderIds = await IncomeEntry.distinct("orderId", match);

  const skuSummary = await OrderItem.aggregate([
    { $match: { orderId: { $in: orderIds } } },
    {
      $group: {
        _id: {
          sellerSku: "$sellerSku",
          productName: "$productName",
        },
        sellerSku: { $first: "$sellerSku" },
        productName: { $first: "$productName" },
        baseProductCode: { $first: "$baseProductCode" },
        packMultiplier: { $first: "$packMultiplier" },
        ordersCount: { $addToSet: "$orderId" },
        soldUnitsTikTok: { $sum: "$qty" },
        equivalentBaseUnits: {
          $sum: { $multiply: ["$qty", "$packMultiplier"] },
        },
        grossItemAmount: { $sum: "$itemSubtotalAfterDiscount" },
      },
    },
    {
      $project: {
        _id: 0,
        sellerSku: 1,
        productName: 1,
        baseProductCode: 1,
        packMultiplier: 1,
        ordersCount: { $size: "$ordersCount" },
        soldUnitsTikTok: 1,
        equivalentBaseUnits: 1,
        grossItemAmount: 1,
      },
    },
    { $sort: { grossItemAmount: -1, sellerSku: 1 } },
  ]);

  const baseProductSummary = await OrderItem.aggregate([
    { $match: { orderId: { $in: orderIds } } },
    {
      $group: {
        _id: "$baseProductCode",
        baseProductCode: { $first: "$baseProductCode" },
        productName: { $first: "$productName" },
        ordersCount: { $addToSet: "$orderId" },
        soldUnitsTikTok: { $sum: "$qty" },
        equivalentBaseUnits: {
          $sum: { $multiply: ["$qty", "$packMultiplier"] },
        },
        grossItemAmount: { $sum: "$itemSubtotalAfterDiscount" },
      },
    },
    {
      $project: {
        _id: 0,
        baseProductCode: 1,
        productName: 1,
        ordersCount: { $size: "$ordersCount" },
        soldUnitsTikTok: 1,
        equivalentBaseUnits: 1,
        grossItemAmount: 1,
      },
    },
    { $sort: { grossItemAmount: -1, baseProductCode: 1 } },
  ]);

  const matchedOrders = await OrderItem.distinct("orderId", {
    orderId: { $in: orderIds },
  });

  const sellerSkus = [
    ...new Set(
      skuSummary
        .map((row) => String(row.sellerSku || "").trim())
        .filter(Boolean)
    ),
  ];

  const productMasters = await ProductMaster.find(
    {
      sellerSku: { $in: sellerSkus },
      isSellerSkuUnique: true,
    },
    {
      _id: 0,
      sellerSku: 1,
      skuId: 1,
      productId: 1,
      productName: 1,
      variationValue: 1,
      category: 1,
    }
  ).lean();

  const duplicateSellerSkuMasters = await ProductMaster.find(
    {
      sellerSku: { $in: sellerSkus },
      isSellerSkuUnique: false,
    },
    {
      _id: 0,
      sellerSku: 1,
      duplicateSellerSkuCount: 1,
    }
  ).lean();

  const productMasterBySellerSku = new Map(
    productMasters.map((row) => [row.sellerSku, row])
  );

  const enrichedSkuSummary = skuSummary.map((row) => {
    const mapping = productMasterBySellerSku.get(row.sellerSku);
    if (!mapping) {
      return row;
    }

    return {
      ...row,
      mappedSkuId: mapping.skuId,
      mappedProductId: mapping.productId,
      mappedVariationValue: mapping.variationValue,
      mappedCategory: mapping.category,
      productName: mapping.productName || row.productName,
      mappingSource: "product_master",
    };
  });

  const enrichedBaseProductSummary = baseProductSummary.map((row) => {
    const candidates = enrichedSkuSummary.filter(
      (skuRow) => skuRow.baseProductCode === row.baseProductCode
    );
    const mappedCandidate = candidates.find((candidate) => candidate.mappingSource === "product_master");

    if (!mappedCandidate) {
      return row;
    }

    return {
      ...row,
      productName: mappedCandidate.productName || row.productName,
    };
  });

  const sourceStats = {
    settledOrders: financeSummary.settledOrders || 0,
    matchedOrders: matchedOrders.length,
    missingOrderItemOrders: Math.max(orderIds.length - matchedOrders.length, 0),
    unmatchedItemRows: 0,
    coveragePercent:
      orderIds.length === 0
        ? 0
        : Number(((matchedOrders.length / orderIds.length) * 100).toFixed(2)),
  };

  const duplicateSellerSkuWarnings = [
    ...new Map(
      duplicateSellerSkuMasters.map((row) => [row.sellerSku, row])
    ).values(),
  ];

  return {
    financeSummary,
    withdrawalSummary: {
      withdrawalAmount: financeSummary.withdrawalAmount || 0,
    },
    skuSummary: enrichedSkuSummary,
    baseProductSummary: enrichedBaseProductSummary,
    warnings: [
      ...(sourceStats.missingOrderItemOrders
        ? [
            {
              type: "missing_order_items",
              message: "Some settled orders are missing order item rows.",
            },
          ]
        : []),
      ...duplicateSellerSkuWarnings.map((row) => ({
        type: "duplicate_product_master_seller_sku",
        message: `Product master has duplicate seller SKU mapping for ${row.sellerSku}.`,
        sellerSku: row.sellerSku,
      })),
    ],
    sourceStats,
  };
}

module.exports = {
  buildSummary,
};
