const crypto = require("crypto");
const XLSX = require("xlsx");
const Batch = require("../models/Batch");
const IncomeEntry = require("../models/IncomeEntry");
const OrderHeader = require("../models/OrderHeader");
const OrderItem = require("../models/OrderItem");
const ProductMaster = require("../models/ProductMaster");
const { parseSellerSku } = require("../utils/sku");
const { toIsoDateOnly, toMonthKey } = require("../utils/date");
const { toNumber } = require("../utils/number");
const { normalizeFilename } = require("../utils/filename");

function getWorkbook(buffer) {
  return XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
  });
}

function normalizeSheetRange(sheet) {
  const keys = Object.keys(sheet).filter((key) => /^[A-Z]+[0-9]+$/i.test(key));
  if (keys.length === 0) {
    return sheet;
  }

  let minRow = Number.POSITIVE_INFINITY;
  let minCol = Number.POSITIVE_INFINITY;
  let maxRow = 0;
  let maxCol = 0;

  for (const key of keys) {
    const cell = XLSX.utils.decode_cell(key);
    minRow = Math.min(minRow, cell.r);
    minCol = Math.min(minCol, cell.c);
    maxRow = Math.max(maxRow, cell.r);
    maxCol = Math.max(maxCol, cell.c);
  }

  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: minRow, c: minCol },
    e: { r: maxRow, c: maxCol },
  });

  return sheet;
}

function fileHashFromBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sheetRowsAsArrays(sheet) {
  return XLSX.utils.sheet_to_json(normalizeSheetRange(sheet), {
    header: 1,
    defval: "",
    raw: false,
  });
}

function normalizeHeader(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function findValue(row, headerIndexMap, aliases) {
  for (const alias of aliases) {
    const index = headerIndexMap.get(normalizeHeader(alias));
    if (index !== undefined) {
      return row[index];
    }
  }
  return "";
}

async function createBatch({ batchType, filename, fileHash, period, uploadedBy }) {
  const normalizedFilename = normalizeFilename(filename);
  const existing = await Batch.findOne({ fileHash }).lean();
  if (existing) {
    const error = new Error("This file has already been imported.");
    error.statusCode = 409;
    throw error;
  }

  return Batch.create({
    batchType,
    filename: normalizedFilename,
    fileHash,
    uploadedBy: uploadedBy || "web-import",
    period,
    status: "committed",
    warningCount: 0,
  });
}

function buildIncomeLogicalKey({ orderId, settlementDate, entryType }) {
  return `${orderId}__${settlementDate}__${entryType}`;
}

async function importOrderWorkbook({ buffer, filename, uploadedBy }) {
  const workbook = getWorkbook(buffer);
  const sheet = workbook.Sheets.OrderSKUList || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    const error = new Error("Order workbook does not contain a readable sheet.");
    error.statusCode = 400;
    throw error;
  }

  const rows = sheetRowsAsArrays(sheet);
  const headers = rows[0] || [];
  const headerIndexMap = new Map(
    headers.map((header, index) => [normalizeHeader(header), index])
  );
  const dataRows = rows.slice(2).filter((row) => String(row[0] || "").trim());

  if (!headerIndexMap.has(normalizeHeader("Order ID"))) {
    const error = new Error("Order workbook is missing 'Order ID' column.");
    error.statusCode = 400;
    throw error;
  }

  const batchPeriod = toMonthKey(
    findValue(dataRows[0] || [], headerIndexMap, ["Created Time", "Paid Time", "Delivered Time"])
  );
  const batch = await createBatch({
    batchType: "orders",
    filename,
    fileHash: fileHashFromBuffer(buffer),
    period: batchPeriod,
    uploadedBy,
  });

  const orderHeaders = new Map();
  const orderItems = [];

  for (let index = 0; index < dataRows.length; index += 1) {
    const row = dataRows[index];
    const orderId = String(findValue(row, headerIndexMap, ["Order ID"])).trim();
    if (!orderId) {
      continue;
    }

    if (!orderHeaders.has(orderId)) {
      orderHeaders.set(orderId, {
        batchId: batch._id,
        orderId,
        orderStatus: String(findValue(row, headerIndexMap, ["Order Status"])).trim(),
        orderSubstatus: String(findValue(row, headerIndexMap, ["Order Substatus"])).trim(),
        createdTime: String(findValue(row, headerIndexMap, ["Created Time"])).trim(),
        paidTime: String(findValue(row, headerIndexMap, ["Paid Time"])).trim(),
        deliveredTime: String(findValue(row, headerIndexMap, ["Delivered Time"])).trim(),
        orderAmount: toNumber(findValue(row, headerIndexMap, ["Order Amount"])),
      });
    }

    const sellerSkuRaw = String(findValue(row, headerIndexMap, ["Seller SKU"])).trim();
    const productName = String(findValue(row, headerIndexMap, ["Product Name"])).trim();
    const parsedSku = parseSellerSku(sellerSkuRaw);
    const fallbackCode = productName || `ORDER-${orderId}-LINE-${index + 1}`;

    orderItems.push({
      batchId: batch._id,
      orderId,
      lineNo: index + 1,
      sellerSku: parsedSku.sellerSku,
      productName,
      variation: String(findValue(row, headerIndexMap, ["Variation"])).trim(),
      qty: toNumber(findValue(row, headerIndexMap, ["Quantity"])),
      itemSubtotalAfterDiscount: toNumber(
        findValue(row, headerIndexMap, ["SKU Subtotal After Discount"])
      ),
      baseProductCode: parsedSku.baseProductCode || fallbackCode,
      packMultiplier: parsedSku.packMultiplier,
    });
  }

  await OrderHeader.insertMany([...orderHeaders.values()], { ordered: false });
  await OrderItem.insertMany(orderItems, { ordered: false });

  return {
    batchId: batch._id,
    batchType: batch.batchType,
    filename: batch.filename,
    period: batch.period,
    insertedOrderHeaders: orderHeaders.size,
    insertedOrderItems: orderItems.length,
  };
}

async function importIncomeWorkbook({ buffer, filename, uploadedBy }) {
  const workbook = getWorkbook(buffer);
  const orderSheet =
    workbook.Sheets["Order details"] ||
    workbook.Sheets["Order Details"] ||
    workbook.Sheets[workbook.SheetNames[0]];

  if (!orderSheet) {
    const error = new Error("Income workbook does not contain an order details sheet.");
    error.statusCode = 400;
    throw error;
  }

  const rows = sheetRowsAsArrays(orderSheet);
  const headers = rows[0] || [];
  const headerIndexMap = new Map(
    headers.map((header, index) => [normalizeHeader(header), index])
  );
  const dataRows = rows
    .slice(1)
    .filter((row) =>
      String(findValue(row, headerIndexMap, ["Order ID", "Order id", "Order/adjustment ID"])).trim()
    );

  if (
    !headerIndexMap.has(normalizeHeader("Order ID")) &&
    !headerIndexMap.has(normalizeHeader("Order id")) &&
    !headerIndexMap.has(normalizeHeader("Order/adjustment ID"))
  ) {
    const error = new Error("Income workbook is missing 'Order ID' or 'Order/adjustment ID' column.");
    error.statusCode = 400;
    throw error;
  }

  const period = toMonthKey(
    findValue(dataRows[0] || [], headerIndexMap, [
      "Settlement Date",
      "Order settled time",
      "Order Settled Time",
    ])
  );

  const fileHash = fileHashFromBuffer(buffer);
  const existingBatch = await Batch.findOne({ fileHash }).lean();
  if (existingBatch) {
    return {
      batchId: existingBatch._id,
      batchType: existingBatch.batchType,
      filename: existingBatch.filename,
      period: existingBatch.period,
      insertedIncomeEntries: 0,
      skippedIncomeEntries: dataRows.length,
      skippedReason: "duplicate_file_hash",
    };
  }

  const batch = await createBatch({
    batchType: "income",
    filename,
    fileHash,
    period,
    uploadedBy,
  });

  const incomeEntries = dataRows.map((row) => {
    const orderSettledTime = String(
      findValue(row, headerIndexMap, ["Order settled time", "Order Settled Time"])
    ).trim();
    const settlementDate =
      toIsoDateOnly(findValue(row, headerIndexMap, ["Settlement Date"])) ||
      toIsoDateOnly(orderSettledTime);
    const entryType = String(findValue(row, headerIndexMap, ["Type"])).trim() || "Order";

    return {
      batchId: batch._id,
      orderId: String(
        findValue(row, headerIndexMap, ["Order ID", "Order id", "Order/adjustment ID"])
      ).trim(),
      settlementDate,
      orderSettledTime,
      entryType,
      totalRevenue: toNumber(findValue(row, headerIndexMap, ["Total Revenue", "Revenue"])),
      totalSettlementAmount: toNumber(
        findValue(row, headerIndexMap, ["Total Settlement Amount", "Settlement Amount"])
      ),
      subtotalAfterSellerDiscounts: toNumber(
        findValue(row, headerIndexMap, [
          "Subtotal after seller discounts",
          "Subtotal After Seller Discounts",
        ])
      ),
      sellerDiscounts: toNumber(
        findValue(row, headerIndexMap, ["Seller discounts", "Seller Discounts"])
      ),
      refundSubtotal: toNumber(
        findValue(row, headerIndexMap, ["Refund subtotal", "Refund Subtotal"])
      ),
      totalFees: toNumber(findValue(row, headerIndexMap, ["Total Fees"])),
      transactionFee: toNumber(findValue(row, headerIndexMap, ["Transaction fee"])),
      tiktokShopCommissionFee: toNumber(
        findValue(row, headerIndexMap, ["TikTok Shop commission fee"])
      ),
      sellerShippingFee: toNumber(findValue(row, headerIndexMap, ["Seller shipping fee"])),
      affiliateCommission: toNumber(findValue(row, headerIndexMap, ["Affiliate commission"])),
      liveSpecialsServiceFee: toNumber(
        findValue(row, headerIndexMap, ["LIVE Specials service fee"])
      ),
      commerceGrowthFee: toNumber(findValue(row, headerIndexMap, ["Commerce growth fee"])),
      infrastructureFee: toNumber(findValue(row, headerIndexMap, ["Infrastructure fee"])),
      totalAdjustments: toNumber(findValue(row, headerIndexMap, ["Total adjustments"])),
      withdrawalAmount: toNumber(findValue(row, headerIndexMap, ["Withdrawal amount"])),
    };
  });

  const orderIds = [...new Set(incomeEntries.map((entry) => entry.orderId))];
  const settlementDates = [...new Set(incomeEntries.map((entry) => entry.settlementDate))];
  const entryTypes = [...new Set(incomeEntries.map((entry) => entry.entryType))];

  const existingEntries = await IncomeEntry.find(
    {
      orderId: { $in: orderIds },
      settlementDate: { $in: settlementDates },
      entryType: { $in: entryTypes },
    },
    {
      _id: 0,
      orderId: 1,
      settlementDate: 1,
      entryType: 1,
    }
  ).lean();

  const existingKeySet = new Set(
    existingEntries.map((entry) => buildIncomeLogicalKey(entry))
  );

  const entriesToInsert = [];
  let skippedIncomeEntries = 0;

  for (const entry of incomeEntries) {
    const logicalKey = buildIncomeLogicalKey(entry);
    if (existingKeySet.has(logicalKey)) {
      skippedIncomeEntries += 1;
      continue;
    }

    existingKeySet.add(logicalKey);
    entriesToInsert.push(entry);
  }

  if (entriesToInsert.length > 0) {
    await IncomeEntry.insertMany(entriesToInsert, { ordered: false });
  }

  await Batch.updateOne(
    { _id: batch._id },
    {
      $set: {
        status: entriesToInsert.length === 0 ? "skipped" : "committed",
        warningCount: skippedIncomeEntries,
      },
    }
  );

  return {
    batchId: batch._id,
    batchType: batch.batchType,
    filename: batch.filename,
    period: batch.period,
    insertedIncomeEntries: entriesToInsert.length,
    skippedIncomeEntries,
  };
}

async function importProductMasterWorkbook({ buffer, filename, uploadedBy }) {
  const workbook = getWorkbook(buffer);
  const sheet = workbook.Sheets.Template || workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    const error = new Error("Product master workbook does not contain a readable template sheet.");
    error.statusCode = 400;
    throw error;
  }

  const rows = sheetRowsAsArrays(sheet);
  const headers = rows[0] || [];
  const headerIndexMap = new Map(
    headers.map((header, index) => [normalizeHeader(header), index])
  );
  const dataRows = rows
    .slice(5)
    .filter((row) =>
      [
        findValue(row, headerIndexMap, ["product_id"]),
        findValue(row, headerIndexMap, ["sku_id"]),
        findValue(row, headerIndexMap, ["seller_sku"]),
        findValue(row, headerIndexMap, ["product_name"]),
      ].some((value) => String(value || "").trim())
    );

  if (
    !headerIndexMap.has(normalizeHeader("product_id")) ||
    !headerIndexMap.has(normalizeHeader("sku_id")) ||
    !headerIndexMap.has(normalizeHeader("product_name"))
  ) {
    const error = new Error(
      "Product master workbook is missing one of required columns: product_id, sku_id, product_name."
    );
    error.statusCode = 400;
    throw error;
  }

  const fileHash = fileHashFromBuffer(buffer);
  const existingBatch = await Batch.findOne({ fileHash }).lean();
  if (existingBatch) {
    return {
      batchId: existingBatch._id,
      batchType: existingBatch.batchType,
      filename: existingBatch.filename,
      insertedProductMasters: 0,
      updatedProductMasters: 0,
      skippedProductMasters: dataRows.length,
      skippedReason: "duplicate_file_hash",
    };
  }

  const batch = await createBatch({
    batchType: "product_master",
    filename,
    fileHash,
    period: "",
    uploadedBy,
  });

  const preparedRows = dataRows.map((row) => ({
    batchId: batch._id,
    productId: String(findValue(row, headerIndexMap, ["product_id"])).trim(),
    skuId: String(findValue(row, headerIndexMap, ["sku_id"])).trim(),
    sellerSku: String(findValue(row, headerIndexMap, ["seller_sku"])).trim(),
    productName: String(findValue(row, headerIndexMap, ["product_name"])).trim(),
    variationValue: String(findValue(row, headerIndexMap, ["variation_value"])).trim(),
    category: String(findValue(row, headerIndexMap, ["category"])).trim(),
    brand: String(findValue(row, headerIndexMap, ["brand"])).trim(),
    price: toNumber(findValue(row, headerIndexMap, ["price"])),
    quantity: toNumber(findValue(row, headerIndexMap, ["quantity"])),
  }));

  const existingProductMasters = await ProductMaster.find(
    {
      skuId: { $in: preparedRows.map((row) => row.skuId).filter(Boolean) },
    },
    {
      _id: 0,
      skuId: 1,
      manualSellerSku: 1,
      manualSellerSkuEnabled: 1,
    }
  ).lean();

  const existingProductMasterBySkuId = new Map(
    existingProductMasters.map((row) => [row.skuId, row])
  );

  for (const row of preparedRows) {
    const existing = existingProductMasterBySkuId.get(row.skuId);
    row.manualSellerSku = existing?.manualSellerSku || "";
    row.manualSellerSkuEnabled = existing?.manualSellerSkuEnabled || false;

    if (row.manualSellerSkuEnabled && row.manualSellerSku) {
      row.sellerSku = row.manualSellerSku;
    }
  }

  const sellerSkuCounts = new Map();
  for (const row of preparedRows) {
    if (!row.sellerSku) {
      continue;
    }
    sellerSkuCounts.set(row.sellerSku, (sellerSkuCounts.get(row.sellerSku) || 0) + 1);
  }

  for (const row of preparedRows) {
    const duplicateCount = row.sellerSku ? sellerSkuCounts.get(row.sellerSku) || 0 : 0;
    row.isSellerSkuUnique = !!row.sellerSku && duplicateCount === 1;
    row.duplicateSellerSkuCount = duplicateCount;
  }

  const skuIds = preparedRows.map((row) => row.skuId).filter(Boolean);
  const existingSkuIds = new Set(
    existingProductMasters.map((row) => row.skuId)
  );

  const bulkOperations = preparedRows.map((row) => ({
    updateOne: {
      filter: { skuId: row.skuId },
      update: { $set: row },
      upsert: true,
    },
  }));

  if (bulkOperations.length > 0) {
    await ProductMaster.bulkWrite(bulkOperations, { ordered: false });
  }

  let skippedProductMasters = 0;
  for (const row of preparedRows) {
    if (!row.productId || !row.skuId || !row.productName) {
      skippedProductMasters += 1;
    }
  }

  const insertedProductMasters = preparedRows.filter(
    (row) => row.productId && row.skuId && row.productName && !existingSkuIds.has(row.skuId)
  ).length;
  const updatedProductMasters = preparedRows.filter(
    (row) => row.productId && row.skuId && row.productName && existingSkuIds.has(row.skuId)
  ).length;

  await Batch.updateOne(
    { _id: batch._id },
    {
      $set: {
        status: insertedProductMasters > 0 || updatedProductMasters > 0 ? "committed" : "skipped",
        warningCount: skippedProductMasters,
      },
    }
  );

  return {
    batchId: batch._id,
    batchType: batch.batchType,
    filename: batch.filename,
    insertedProductMasters,
    updatedProductMasters,
    skippedProductMasters,
    duplicateSellerSkuCount: [...sellerSkuCounts.values()].filter((count) => count > 1).length,
  };
}

async function deleteImportedBatch({ batchId }) {
  const batch = await Batch.findById(batchId).lean();
  if (!batch) {
    const error = new Error("batch not found");
    error.statusCode = 404;
    throw error;
  }

  if (batch.batchType === "product_master") {
    const error = new Error(
      "Deleting product master batches is not supported yet because it may overwrite newer mappings."
    );
    error.statusCode = 400;
    throw error;
  }

  const result = {
    batchId: batch._id,
    batchType: batch.batchType,
    filename: batch.filename,
    deletedOrderHeaders: 0,
    deletedOrderItems: 0,
    deletedIncomeEntries: 0,
  };

  if (batch.batchType === "orders") {
    const [orderHeaderResult, orderItemResult] = await Promise.all([
      OrderHeader.deleteMany({ batchId: batch._id }),
      OrderItem.deleteMany({ batchId: batch._id }),
    ]);

    result.deletedOrderHeaders = Number(orderHeaderResult.deletedCount || 0);
    result.deletedOrderItems = Number(orderItemResult.deletedCount || 0);
  }

  if (batch.batchType === "income") {
    const incomeEntryResult = await IncomeEntry.deleteMany({ batchId: batch._id });
    result.deletedIncomeEntries = Number(incomeEntryResult.deletedCount || 0);
  }

  await Batch.deleteOne({ _id: batch._id });

  return result;
}

module.exports = {
  importOrderWorkbook,
  importIncomeWorkbook,
  importProductMasterWorkbook,
  deleteImportedBatch,
};
