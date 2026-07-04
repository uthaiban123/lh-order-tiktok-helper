const IncomeEntry = require("../models/IncomeEntry");
const OrderItem = require("../models/OrderItem");
const ProductMaster = require("../models/ProductMaster");
const { summarizeOrderItems } = require("./summaryService");

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateIsoDate(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!ISO_DATE_PATTERN.test(normalized)) {
    throw Object.assign(new Error(`${fieldName} ต้องอยู่ในรูปแบบ YYYY-MM-DD`), {
      statusCode: 400,
    });
  }

  return normalized;
}

function normalizeSellerSkus(sellerSkus) {
  const values = Array.isArray(sellerSkus)
    ? sellerSkus
    : String(sellerSkus || "")
        .split(",")
        .map((value) => value.trim());

  const unique = [...new Set(values.filter(Boolean))];
  if (!unique.length) {
    throw Object.assign(new Error("ต้องเลือก Seller SKU อย่างน้อย 1 รายการ"), {
      statusCode: 400,
    });
  }

  return unique;
}

function buildCountRow(existing, item) {
  if (!existing) {
    return {
      sellerSku: item.sellerSku,
      productName: item.productName,
      baseProductCode: item.baseProductCode,
      packMultiplier: item.packMultiplier,
      ordersSet: new Set([item.orderId]),
      soldUnitsTikTok: Number(item.qty || 0),
      equivalentBaseUnits:
        Number(item.qty || 0) * Number(item.packMultiplier || 1),
    };
  }

  existing.ordersSet.add(item.orderId);
  existing.soldUnitsTikTok += Number(item.qty || 0);
  existing.equivalentBaseUnits +=
    Number(item.qty || 0) * Number(item.packMultiplier || 1);
  return existing;
}

function finalizeCountRows(rows) {
  return rows
    .map((row) => ({
      sellerSku: row.sellerSku,
      productName: row.productName,
      baseProductCode: row.baseProductCode,
      packMultiplier: row.packMultiplier,
      ordersCount: row.ordersSet.size,
      soldUnitsTikTok: row.soldUnitsTikTok,
      equivalentBaseUnits: row.equivalentBaseUnits,
    }))
    .sort((left, right) => {
      if (right.soldUnitsTikTok !== left.soldUnitsTikTok) {
        return right.soldUnitsTikTok - left.soldUnitsTikTok;
      }

      return String(left.sellerSku || "").localeCompare(String(right.sellerSku || ""));
    });
}

function buildTotals(items, filteredItems = []) {
  const uniqueOrders = new Set(filteredItems.map((item) => item.orderId));

  return items.reduce(
    (accumulator, row) => {
      accumulator.soldUnitsTikTok += Number(row.soldUnitsTikTok || 0);
      accumulator.equivalentBaseUnits += Number(row.equivalentBaseUnits || 0);
      return accumulator;
    },
    {
      ordersCount: uniqueOrders.size,
      soldUnitsTikTok: 0,
      equivalentBaseUnits: 0,
    }
  );
}

async function buildProductCount({ startDate, endDate, sellerSkus }) {
  const normalizedStartDate = validateIsoDate(startDate, "startDate");
  const normalizedEndDate = validateIsoDate(endDate, "endDate");
  const selectedSellerSkus = normalizeSellerSkus(sellerSkus);

  if (normalizedStartDate > normalizedEndDate) {
    throw Object.assign(new Error("startDate ต้องไม่มากกว่า endDate"), {
      statusCode: 400,
    });
  }

  const selectedSellerSkuSet = new Set(selectedSellerSkus);
  const incomeEntries = await IncomeEntry.find(
    {
      settlementDate: {
        $gte: normalizedStartDate,
        $lte: normalizedEndDate,
      },
    },
    {
      _id: 0,
      orderId: 1,
    }
  ).lean();

  const orderIds = [...new Set(incomeEntries.map((entry) => entry.orderId))];

  if (!orderIds.length) {
    return {
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      sellerSkus: selectedSellerSkus,
      items: [],
      totals: buildTotals([]),
      sourceStats: {
        settledOrders: 0,
        matchedOrders: 0,
        orderItemRows: 0,
        matchedItemRows: 0,
        coveragePercent: 0,
      },
    };
  }

  const orderItems = await OrderItem.find(
    { orderId: { $in: orderIds } },
    {
      _id: 0,
      orderId: 1,
      sellerSku: 1,
      productName: 1,
      variation: 1,
      qty: 1,
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

  const { enrichedItems } = summarizeOrderItems(orderItems, productMasters);
  const filteredItems = enrichedItems.filter((item) =>
    selectedSellerSkuSet.has(String(item.sellerSku || "").trim())
  );

  const countMap = new Map();
  for (const item of filteredItems) {
    const key = String(item.sellerSku || "").trim();
    countMap.set(key, buildCountRow(countMap.get(key), item));
  }

  const items = finalizeCountRows([...countMap.values()]);
  const settledOrders = orderIds.length;
  const matchedOrdersCount = matchedOrders.length;

  return {
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    sellerSkus: selectedSellerSkus,
    items,
    totals: buildTotals(items, filteredItems),
    sourceStats: {
      settledOrders,
      matchedOrders: matchedOrdersCount,
      orderItemRows: enrichedItems.length,
      matchedItemRows: filteredItems.length,
      coveragePercent:
        settledOrders === 0
          ? 0
          : Number(((matchedOrdersCount / settledOrders) * 100).toFixed(2)),
    },
  };
}

async function listSellerSkus({ search = "" } = {}) {
  const normalizedSearch = String(search || "").trim();
  const searchFilter = normalizedSearch
    ? {
        $or: [
          { sellerSku: { $regex: normalizedSearch, $options: "i" } },
          { manualSellerSku: { $regex: normalizedSearch, $options: "i" } },
          { productName: { $regex: normalizedSearch, $options: "i" } },
          { baseProductCode: { $regex: normalizedSearch, $options: "i" } },
        ],
      }
    : {};

  const [productMasters, orderSkuRows] = await Promise.all([
    ProductMaster.find(searchFilter, {
      _id: 0,
      sellerSku: 1,
      manualSellerSku: 1,
      manualSellerSkuEnabled: 1,
      productName: 1,
      baseProductCode: 1,
      packMultiplier: 1,
    })
      .sort({ sellerSku: 1 })
      .limit(1000)
      .lean(),
    OrderItem.aggregate([
      ...(normalizedSearch
        ? [
            {
              $match: {
                sellerSku: { $regex: normalizedSearch, $options: "i" },
              },
            },
          ]
        : []),
      {
        $group: {
          _id: "$sellerSku",
          productName: { $first: "$productName" },
          baseProductCode: { $first: "$baseProductCode" },
          packMultiplier: { $first: "$packMultiplier" },
        },
      },
      {
        $match: {
          _id: { $ne: "" },
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
      {
        $limit: 1000,
      },
    ]),
  ]);

  const skuMap = new Map();

  for (const row of productMasters) {
    const sellerSku = row.manualSellerSkuEnabled && row.manualSellerSku
      ? String(row.manualSellerSku).trim()
      : String(row.sellerSku || "").trim();

    if (!sellerSku) {
      continue;
    }

    skuMap.set(sellerSku, {
      sellerSku,
      productName: row.productName || "",
      baseProductCode: row.baseProductCode || "",
      packMultiplier: Math.max(1, Number(row.packMultiplier) || 1),
      source: "product_master",
    });
  }

  for (const row of orderSkuRows) {
    const sellerSku = String(row._id || "").trim();
    if (!sellerSku || skuMap.has(sellerSku)) {
      continue;
    }

    skuMap.set(sellerSku, {
      sellerSku,
      productName: row.productName || "",
      baseProductCode: row.baseProductCode || "",
      packMultiplier: Math.max(1, Number(row.packMultiplier) || 1),
      source: "order_item",
    });
  }

  return [...skuMap.values()].sort((left, right) =>
    String(left.sellerSku).localeCompare(String(right.sellerSku))
  );
}

module.exports = {
  buildProductCount,
  listSellerSkus,
};
