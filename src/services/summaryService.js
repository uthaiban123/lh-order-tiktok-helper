const IncomeEntry = require("../models/IncomeEntry");
const OrderItem = require("../models/OrderItem");
const ProductMaster = require("../models/ProductMaster");

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeVariation(value) {
  const normalized = normalizeText(value)
    .replace(/^default$/, "ค่าเริ่มต้น");

  if (!normalized) {
    return "ค่าเริ่มต้น";
  }

  return normalized;
}

function getNameVariationKey(productName, variation) {
  return `${normalizeText(productName)}|||${normalizeVariation(variation)}`;
}

function buildUniqueMap(rows, keySelector) {
  const grouped = new Map();

  for (const row of rows) {
    const key = keySelector(row);
    if (!key) {
      continue;
    }

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(row);
  }

  const uniqueMap = new Map();

  for (const [key, group] of grouped.entries()) {
    if (group.length === 1) {
      uniqueMap.set(key, group[0]);
    }
  }

  return uniqueMap;
}

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

function summarizeOrderItems(orderItems, productMasters) {
  const productMasterBySellerSku = buildUniqueMap(
    productMasters.filter((row) => String(row.sellerSku || "").trim()),
    (row) => String(row.sellerSku || "").trim()
  );

  const productMasterByNameVariation = buildUniqueMap(
    productMasters.filter((row) => String(row.sellerSku || "").trim()),
    (row) => getNameVariationKey(row.productName, row.variationValue)
  );

  const skuSummaryMap = new Map();
  const baseProductSummaryMap = new Map();
  let inferredSellerSkuItemRows = 0;
  let unresolvedSellerSkuItemRows = 0;

  for (const item of orderItems) {
    const rawSellerSku = String(item.sellerSku || "").trim();
    const sellerSkuMapping = rawSellerSku
      ? productMasterBySellerSku.get(rawSellerSku)
      : null;
    const nameVariationMapping = rawSellerSku
      ? null
      : productMasterByNameVariation.get(
          getNameVariationKey(item.productName, item.variation)
        );

    const effectiveMapping = sellerSkuMapping || nameVariationMapping || null;
    const effectiveSellerSku = rawSellerSku || effectiveMapping?.sellerSku || "";
    const effectiveProductName = effectiveMapping?.productName || item.productName;
    const skuKey = `${effectiveSellerSku}|||${effectiveProductName}`;
    const baseProductCode = String(item.baseProductCode || "").trim();
    const baseKey = baseProductCode || effectiveProductName;

    if (!rawSellerSku) {
      if (effectiveSellerSku) {
        inferredSellerSkuItemRows += 1;
      } else {
        unresolvedSellerSkuItemRows += 1;
      }
    }

    if (!skuSummaryMap.has(skuKey)) {
      skuSummaryMap.set(skuKey, {
        sellerSku: effectiveSellerSku,
        productName: effectiveProductName,
        baseProductCode,
        packMultiplier: item.packMultiplier,
        ordersSet: new Set(),
        soldUnitsTikTok: 0,
        equivalentBaseUnits: 0,
        grossItemAmount: 0,
        mappedSkuId: effectiveMapping?.skuId,
        mappedProductId: effectiveMapping?.productId,
        mappedVariationValue: effectiveMapping?.variationValue,
        mappedCategory: effectiveMapping?.category,
        mappingSource: !rawSellerSku && effectiveMapping ? "product_master_name_variation" : effectiveMapping ? "product_master" : undefined,
      });
    }

    const skuSummaryRow = skuSummaryMap.get(skuKey);
    skuSummaryRow.ordersSet.add(item.orderId);
    skuSummaryRow.soldUnitsTikTok += item.qty;
    skuSummaryRow.equivalentBaseUnits += item.qty * item.packMultiplier;
    skuSummaryRow.grossItemAmount += item.itemSubtotalAfterDiscount;

    if (!baseProductSummaryMap.has(baseKey)) {
      baseProductSummaryMap.set(baseKey, {
        baseProductCode,
        productName: effectiveProductName,
        ordersSet: new Set(),
        soldUnitsTikTok: 0,
        equivalentBaseUnits: 0,
        grossItemAmount: 0,
      });
    }

    const baseSummaryRow = baseProductSummaryMap.get(baseKey);
    baseSummaryRow.ordersSet.add(item.orderId);
    baseSummaryRow.soldUnitsTikTok += item.qty;
    baseSummaryRow.equivalentBaseUnits += item.qty * item.packMultiplier;
    baseSummaryRow.grossItemAmount += item.itemSubtotalAfterDiscount;
  }

  const skuSummary = [...skuSummaryMap.values()]
    .map((row) => ({
      ...row,
      ordersCount: row.ordersSet.size,
    }))
    .sort((left, right) => {
      if (right.grossItemAmount !== left.grossItemAmount) {
        return right.grossItemAmount - left.grossItemAmount;
      }

      return String(left.sellerSku || "").localeCompare(String(right.sellerSku || ""));
    });

  const baseProductSummary = [...baseProductSummaryMap.values()]
    .map((row) => ({
      ...row,
      ordersCount: row.ordersSet.size,
    }))
    .sort((left, right) => {
      if (right.grossItemAmount !== left.grossItemAmount) {
        return right.grossItemAmount - left.grossItemAmount;
      }

      return String(left.baseProductCode || "").localeCompare(String(right.baseProductCode || ""));
    });

  return {
    skuSummary,
    baseProductSummary,
    inferredSellerSkuItemRows,
    unresolvedSellerSkuItemRows,
    duplicateSellerSkuWarnings: [
      ...new Map(
        productMasters
          .filter((row) => row.isSellerSkuUnique === false && String(row.sellerSku || "").trim())
          .map((row) => [row.sellerSku, row])
      ).values(),
    ],
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

  const orderItems = await OrderItem.find(
    { orderId: { $in: orderIds } },
    {
      _id: 0,
      orderId: 1,
      sellerSku: 1,
      productName: 1,
      variation: 1,
      qty: 1,
      itemSubtotalAfterDiscount: 1,
      baseProductCode: 1,
      packMultiplier: 1,
    }
  ).lean();

  const matchedOrders = await OrderItem.distinct("orderId", {
    orderId: { $in: orderIds },
  });

  const productMasters = await ProductMaster.find(
    {},
    {
      _id: 0,
      sellerSku: 1,
      skuId: 1,
      productId: 1,
      productName: 1,
      variationValue: 1,
      category: 1,
      isSellerSkuUnique: 1,
      duplicateSellerSkuCount: 1,
    }
  ).lean();

  const {
    skuSummary,
    baseProductSummary,
    inferredSellerSkuItemRows,
    unresolvedSellerSkuItemRows,
    duplicateSellerSkuWarnings,
  } = summarizeOrderItems(orderItems, productMasters);

  const sourceStats = {
    settledOrders: financeSummary.settledOrders || 0,
    matchedOrders: matchedOrders.length,
    missingOrderItemOrders: Math.max(orderIds.length - matchedOrders.length, 0),
    inferredSellerSkuItemRows,
    unresolvedSellerSkuItemRows,
    coveragePercent:
      orderIds.length === 0
        ? 0
        : Number(((matchedOrders.length / orderIds.length) * 100).toFixed(2)),
  };

  return {
    financeSummary,
    withdrawalSummary: {
      withdrawalAmount: financeSummary.withdrawalAmount || 0,
    },
    skuSummary,
    baseProductSummary,
    warnings: [
      ...(sourceStats.missingOrderItemOrders
        ? [
            {
              type: "missing_order_items",
              message: "Some settled orders are missing order item rows.",
            },
          ]
        : []),
      ...(sourceStats.unresolvedSellerSkuItemRows
        ? [
            {
              type: "missing_seller_sku",
              message: "Some order item rows are still missing seller SKU after product master matching.",
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
