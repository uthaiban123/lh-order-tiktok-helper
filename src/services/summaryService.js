const IncomeEntry = require("../models/IncomeEntry");
const OrderItem = require("../models/OrderItem");
const OrderHeader = require("../models/OrderHeader");
const ProductMaster = require("../models/ProductMaster");

const MAX_WARNING_DETAILS = 50;

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

function buildSummaryTotals(rows, options = {}) {
  const includeOrdersCount = options.includeOrdersCount !== false;
  const amountKey = options.amountKey || "grossItemAmount";
  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.soldUnitsTikTok += Number(row.soldUnitsTikTok || 0);
      accumulator.equivalentBaseUnits += Number(row.equivalentBaseUnits || 0);
      accumulator.amount += Number(row[amountKey] || 0);

      if (includeOrdersCount) {
        accumulator.ordersCount += Number(row.ordersCount || 0);
      }

      return accumulator;
    },
    {
      ordersCount: 0,
      soldUnitsTikTok: 0,
      equivalentBaseUnits: 0,
      amount: 0,
    }
  );

  return {
    ...totals,
    unitPriceAverage:
      totals.soldUnitsTikTok > 0
        ? totals.amount / totals.soldUnitsTikTok
        : 0,
  };
}

function buildWarningDetails(details) {
  return {
    rows: details.slice(0, MAX_WARNING_DETAILS),
    extraCount: Math.max(details.length - MAX_WARNING_DETAILS, 0),
    totalCount: details.length,
  };
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function allocateRoundedAmounts(totalAmount, basisValues) {
  const normalizedTotal = roundMoney(totalAmount);
  if (!basisValues.length) {
    return [];
  }

  const totalBasis = basisValues.reduce((sum, value) => sum + Number(value || 0), 0);
  const allocations = [];
  let allocatedSoFar = 0;

  for (let index = 0; index < basisValues.length; index += 1) {
    if (index === basisValues.length - 1) {
      allocations.push(roundMoney(normalizedTotal - allocatedSoFar));
      break;
    }

    const ratio = totalBasis > 0 ? Number(basisValues[index] || 0) / totalBasis : 0;
    const allocatedAmount = roundMoney(normalizedTotal * ratio);
    allocations.push(allocatedAmount);
    allocatedSoFar = roundMoney(allocatedSoFar + allocatedAmount);
  }

  return allocations;
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

  const enrichedItems = [];
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

    enrichedItems.push({
      orderId: item.orderId,
      sellerSku: effectiveSellerSku,
      productName: effectiveProductName,
      variation: item.variation,
      baseProductCode,
      packMultiplier: item.packMultiplier,
      qty: item.qty,
      itemSubtotalAfterDiscount: item.itemSubtotalAfterDiscount,
      skuKey,
      baseKey,
      mappedSkuId: effectiveMapping?.skuId,
      mappedProductId: effectiveMapping?.productId,
      mappedVariationValue: effectiveMapping?.variationValue,
      mappedCategory: effectiveMapping?.category,
      mappingSource: !rawSellerSku && effectiveMapping ? "product_master_name_variation" : effectiveMapping ? "product_master" : undefined,
    });
  }

  return {
    enrichedItems,
    productMasterByNameVariation,
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

function buildProductSummaries({
  enrichedItems,
  incomeByOrderId,
  missingOrderItemAdjustmentAmount,
  missingOrderItemOrdersCount,
}) {
  const skuSummaryMap = new Map();
  const baseProductSummaryMap = new Map();
  const itemsByOrderId = new Map();

  for (const item of enrichedItems) {
    if (!itemsByOrderId.has(item.orderId)) {
      itemsByOrderId.set(item.orderId, []);
    }

    itemsByOrderId.get(item.orderId).push(item);
  }

  for (const [orderId, items] of itemsByOrderId.entries()) {
    const incomeRow = incomeByOrderId.get(orderId);
    const settlementAmount = Number(incomeRow?.totalSettlementAmount || 0);
    const subtotalBasis = items.map((item) => Math.max(Number(item.itemSubtotalAfterDiscount || 0), 0));
    const totalSubtotalBasis = subtotalBasis.reduce((sum, value) => sum + value, 0);
    const qtyBasis = items.map((item) => Math.max(Number(item.qty || 0), 0));
    const totalQtyBasis = qtyBasis.reduce((sum, value) => sum + value, 0);
    const fallbackBasis = items.map(() => 1);

    const allocationBasis =
      totalSubtotalBasis > 0
        ? subtotalBasis
        : totalQtyBasis > 0
          ? qtyBasis
          : fallbackBasis;

    const allocatedAmounts = allocateRoundedAmounts(settlementAmount, allocationBasis);

    items.forEach((item, index) => {
      const receivedSettlementAmount = allocatedAmounts[index] || 0;

      if (!skuSummaryMap.has(item.skuKey)) {
        skuSummaryMap.set(item.skuKey, {
          sellerSku: item.sellerSku,
          productName: item.productName,
          baseProductCode: item.baseProductCode,
          packMultiplier: item.packMultiplier,
          ordersSet: new Set(),
          soldUnitsTikTok: 0,
          equivalentBaseUnits: 0,
          grossItemAmount: 0,
          receivedSettlementAmount: 0,
          mappedSkuId: item.mappedSkuId,
          mappedProductId: item.mappedProductId,
          mappedVariationValue: item.mappedVariationValue,
          mappedCategory: item.mappedCategory,
          mappingSource: item.mappingSource,
        });
      }

      const skuSummaryRow = skuSummaryMap.get(item.skuKey);
      skuSummaryRow.ordersSet.add(item.orderId);
      skuSummaryRow.soldUnitsTikTok += Number(item.qty || 0);
      skuSummaryRow.equivalentBaseUnits += Number(item.qty || 0) * Number(item.packMultiplier || 1);
      skuSummaryRow.grossItemAmount += Number(item.itemSubtotalAfterDiscount || 0);
      skuSummaryRow.receivedSettlementAmount += receivedSettlementAmount;

      if (!baseProductSummaryMap.has(item.baseKey)) {
        baseProductSummaryMap.set(item.baseKey, {
          baseProductCode: item.baseProductCode,
          productName: item.productName,
          ordersSet: new Set(),
          soldUnitsTikTok: 0,
          equivalentBaseUnits: 0,
          grossItemAmount: 0,
          receivedSettlementAmount: 0,
        });
      }

      const baseSummaryRow = baseProductSummaryMap.get(item.baseKey);
      baseSummaryRow.ordersSet.add(item.orderId);
      baseSummaryRow.soldUnitsTikTok += Number(item.qty || 0);
      baseSummaryRow.equivalentBaseUnits += Number(item.qty || 0) * Number(item.packMultiplier || 1);
      baseSummaryRow.grossItemAmount += Number(item.itemSubtotalAfterDiscount || 0);
      baseSummaryRow.receivedSettlementAmount += receivedSettlementAmount;
    });
  }

  if (Math.abs(Number(missingOrderItemAdjustmentAmount || 0)) > 0.000001) {
    const adjustmentSkuKey = "__tiktok_system_adjustment__";
    skuSummaryMap.set(adjustmentSkuKey, {
      sellerSku: "",
      productName: "TikTok system adjustment / refund",
      baseProductCode: "",
      packMultiplier: 1,
      ordersSet: new Set(),
      soldUnitsTikTok: 0,
      equivalentBaseUnits: 0,
      grossItemAmount: 0,
      receivedSettlementAmount: Number(missingOrderItemAdjustmentAmount || 0),
      mappingSource: "unmapped_income_adjustment",
      isAdjustmentRow: true,
      ordersCountOverride: Number(missingOrderItemOrdersCount || 0),
    });

    baseProductSummaryMap.set(adjustmentSkuKey, {
      baseProductCode: "",
      productName: "TikTok system adjustment / refund",
      ordersSet: new Set(),
      soldUnitsTikTok: 0,
      equivalentBaseUnits: 0,
      grossItemAmount: 0,
      receivedSettlementAmount: Number(missingOrderItemAdjustmentAmount || 0),
      isAdjustmentRow: true,
      ordersCountOverride: Number(missingOrderItemOrdersCount || 0),
    });
  }

  const skuSummary = [...skuSummaryMap.values()]
    .map((row) => ({
      ...row,
      ordersCount:
        typeof row.ordersCountOverride === "number"
          ? row.ordersCountOverride
          : row.ordersSet.size,
      receivedSettlementAmount: roundMoney(row.receivedSettlementAmount),
      grossItemAmount: roundMoney(row.grossItemAmount),
    }))
    .sort((left, right) => {
      if (right.receivedSettlementAmount !== left.receivedSettlementAmount) {
        return right.receivedSettlementAmount - left.receivedSettlementAmount;
      }

      return String(left.sellerSku || "").localeCompare(String(right.sellerSku || ""));
    });

  const baseProductSummary = [...baseProductSummaryMap.values()]
    .map((row) => ({
      ...row,
      ordersCount:
        typeof row.ordersCountOverride === "number"
          ? row.ordersCountOverride
          : row.ordersSet.size,
      receivedSettlementAmount: roundMoney(row.receivedSettlementAmount),
      grossItemAmount: roundMoney(row.grossItemAmount),
    }))
    .sort((left, right) => {
      if (right.receivedSettlementAmount !== left.receivedSettlementAmount) {
        return right.receivedSettlementAmount - left.receivedSettlementAmount;
      }

      return String(left.baseProductCode || "").localeCompare(String(right.baseProductCode || ""));
    });

  return {
    skuSummary,
    baseProductSummary,
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

  const incomeEntries = await IncomeEntry.find(
    match,
    {
      _id: 0,
      orderId: 1,
      entryType: 1,
      totalRevenue: 1,
      totalSettlementAmount: 1,
      totalFees: 1,
    }
  ).lean();

  const orderIds = [...new Set(incomeEntries.map((entry) => entry.orderId))];
  const incomeByOrderId = incomeEntries.reduce((map, entry) => {
    if (!map.has(entry.orderId)) {
      map.set(entry.orderId, {
        orderId: entry.orderId,
        totalRevenue: 0,
        totalSettlementAmount: 0,
        totalFees: 0,
        entryTypes: new Set(),
      });
    }

    const current = map.get(entry.orderId);
    current.totalRevenue += Number(entry.totalRevenue || 0);
    current.totalSettlementAmount += Number(entry.totalSettlementAmount || 0);
    current.totalFees += Number(entry.totalFees || 0);
    current.entryTypes.add(entry.entryType || "Order");
    return map;
  }, new Map());

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

  const matchedOrdersSet = new Set(matchedOrders);

  const orderHeaders = await OrderHeader.find(
    { orderId: { $in: orderIds } },
    {
      _id: 0,
      orderId: 1,
      orderAmount: 1,
    }
  ).lean();

  const orderHeaderByOrderId = new Map(
    orderHeaders.map((header) => [header.orderId, header])
  );

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
    enrichedItems,
    inferredSellerSkuItemRows,
    unresolvedSellerSkuItemRows,
    duplicateSellerSkuWarnings,
    productMasterByNameVariation,
  } = summarizeOrderItems(orderItems, productMasters);

  const sourceStats = {
    settledOrders: orderIds.length,
    matchedOrders: matchedOrders.length,
    missingOrderItemOrders: Math.max(orderIds.length - matchedOrders.length, 0),
    inferredSellerSkuItemRows,
    unresolvedSellerSkuItemRows,
    coveragePercent:
      orderIds.length === 0
        ? 0
        : Number(((matchedOrders.length / orderIds.length) * 100).toFixed(2)),
  };

  const missingOrderItemDetails = orderIds
    .filter((orderId) => !matchedOrdersSet.has(orderId))
    .map((orderId) => {
      const incomeEntry = incomeByOrderId.get(orderId);
      const orderHeader = orderHeaderByOrderId.get(orderId);

      return {
        orderId,
        totalRevenue: incomeEntry?.totalRevenue || 0,
        totalSettlementAmount: incomeEntry?.totalSettlementAmount || 0,
        orderAmount: orderHeader?.orderAmount || 0,
        entryTypes: incomeEntry?.entryTypes ? [...incomeEntry.entryTypes].join(", ") : "Order",
      };
    })
    .sort((left, right) => right.totalSettlementAmount - left.totalSettlementAmount);

  const missingOrderItemAdjustmentAmount = missingOrderItemDetails.reduce(
    (sum, row) => sum + Number(row.totalSettlementAmount || 0),
    0
  );

  const {
    skuSummary,
    baseProductSummary,
  } = buildProductSummaries({
    enrichedItems,
    incomeByOrderId,
    missingOrderItemAdjustmentAmount,
    missingOrderItemOrdersCount: missingOrderItemDetails.length,
  });

  const unresolvedSellerSkuDetails = enrichedItems
    .filter((item) => !String(item.sellerSku || "").trim())
    .map((item) => {
      const mappedRow = productMasterByNameVariation.get(
        getNameVariationKey(item.productName, item.variation)
      );

      if (mappedRow && String(mappedRow.sellerSku || "").trim()) {
        return null;
      }

      return {
        orderId: item.orderId,
        productName: item.productName,
        variation: item.variation || item.mappedVariationValue || "ค่าเริ่มต้น",
        qty: item.qty || 0,
        itemSubtotalAfterDiscount: item.itemSubtotalAfterDiscount || 0,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.itemSubtotalAfterDiscount - left.itemSubtotalAfterDiscount);

  return {
    financeSummary,
    withdrawalSummary: {
      withdrawalAmount: financeSummary.withdrawalAmount || 0,
    },
    skuSummary,
    baseProductSummary,
    totals: {
      skuSummary: buildSummaryTotals(skuSummary, { amountKey: "receivedSettlementAmount" }),
      baseProductSummary: buildSummaryTotals(baseProductSummary, { amountKey: "receivedSettlementAmount" }),
    },
    warnings: [
      ...(missingOrderItemDetails.length
        ? [
            {
              type: "missing_order_items",
              message: `Found ${missingOrderItemDetails.length} settled orders without order item rows. Their settlement amount is included in TikTok system adjustment / refund so the grand total still matches settlement.`,
              columns: [
                { key: "orderId", label: "Order ID" },
                { key: "entryTypes", label: "Type" },
                { key: "orderAmount", label: "Order Amount", format: "money" },
                { key: "totalRevenue", label: "Revenue", format: "money" },
                { key: "totalSettlementAmount", label: "Settlement", format: "money" },
              ],
              details: buildWarningDetails(missingOrderItemDetails),
            },
          ]
        : []),
      ...(unresolvedSellerSkuDetails.length
        ? [
            {
              type: "missing_seller_sku",
              message: `Found ${unresolvedSellerSkuDetails.length} order item rows that are still missing seller SKU after product master matching.`,
              columns: [
                { key: "orderId", label: "Order ID" },
                { key: "productName", label: "Product" },
                { key: "variation", label: "Variation" },
                { key: "qty", label: "Qty", format: "number" },
                {
                  key: "itemSubtotalAfterDiscount",
                  label: "Amount",
                  format: "money",
                },
              ],
              details: buildWarningDetails(unresolvedSellerSkuDetails),
            },
          ]
        : []),
      ...duplicateSellerSkuWarnings.map((row) => ({
        type: "duplicate_product_master_seller_sku",
        message: `Product master has duplicate seller SKU mapping for ${row.sellerSku}.`,
        sellerSku: row.sellerSku,
        columns: [
          { key: "sellerSku", label: "Seller SKU" },
          { key: "productName", label: "Product" },
          { key: "variationValue", label: "Variation" },
          { key: "category", label: "Category" },
          { key: "duplicateSellerSkuCount", label: "Duplicate Rows", format: "number" },
        ],
        details: buildWarningDetails([
          {
            sellerSku: row.sellerSku,
            productName: row.productName,
            variationValue: row.variationValue || "ค่าเริ่มต้น",
            category: row.category || "-",
            duplicateSellerSkuCount: row.duplicateSellerSkuCount || 0,
          },
        ]),
      })),
    ],
    sourceStats,
  };
}

module.exports = {
  buildSummary,
};
