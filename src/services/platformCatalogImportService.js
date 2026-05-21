const crypto = require("crypto");
const Batch = require("../models/Batch");
const ProductMaster = require("../models/ProductMaster");
const PendingPlatformListing = require("../models/PendingPlatformListing");
const platformTemplates = require("../config/platformTemplates");
const { parseSellerSku } = require("../utils/sku");
const { toNumber } = require("../utils/number");
const { buildMatchKey } = require("../utils/matchText");
const {
  getWorkbook,
  parseRowsFromConfig,
  getCellValue,
} = require("../utils/workbook");
const { suggestLinksForPlatform, confirmLink } = require("./productMatchingService");

function fileHashFromBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function createBatch({ batchType, filename, fileHash, uploadedBy }) {
  return Batch.create({
    batchType,
    filename,
    fileHash,
    uploadedBy,
    period: "",
    status: "committed",
  });
}

function enrichTiktokRow(row) {
  const parsed = parseSellerSku(row.sellerSku);
  const matchKey = buildMatchKey(row.productName, row.variationValue);
  const now = new Date();
  return {
    ...row,
    matchKey,
    baseProductCode: parsed.baseProductCode,
    packMultiplier: parsed.packMultiplier,
    canonicalPrice: row.price,
    platforms: {
      tiktok: {
        productId: row.productId,
        skuId: row.skuId,
        sellerSku: row.sellerSku,
        productName: row.productName,
        variationValue: row.variationValue,
        price: row.price,
        quantity: row.quantity,
        linkStatus: "native",
        lastImportedAt: now,
      },
    },
  };
}

async function importTiktokCatalog({ buffer, filename, uploadedBy }) {
  const config = platformTemplates.tiktok;
  const workbook = getWorkbook(buffer);
  const sheet = workbook.Sheets[config.sheet] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    const error = new Error("TikTok template sheet not found.");
    error.statusCode = 400;
    throw error;
  }

  const { headerIndexMap, dataRows } = parseRowsFromConfig(sheet, config);
  const cols = config.columns;

  const fileHash = fileHashFromBuffer(buffer);
  const existingBatch = await Batch.findOne({ fileHash }).lean();
  if (existingBatch) {
    return {
      batchId: existingBatch._id,
      skippedReason: "duplicate_file_hash",
      inserted: 0,
      updated: 0,
    };
  }

  const batch = await createBatch({
    batchType: "product_master",
    filename,
    fileHash,
    uploadedBy,
  });

  const preparedRows = dataRows
    .map((row) => {
      const productId = getCellValue(row, headerIndexMap, cols.productId);
      const skuId = getCellValue(row, headerIndexMap, cols.skuId);
      const productName = getCellValue(row, headerIndexMap, cols.productName);
      if (!productId && !skuId && !productName) return null;

      return enrichTiktokRow({
        batchId: batch._id,
        productId,
        skuId,
        sellerSku: getCellValue(row, headerIndexMap, cols.sellerSku),
        productName,
        variationValue: getCellValue(row, headerIndexMap, cols.variationValue),
        category: getCellValue(row, headerIndexMap, cols.category),
        brand: "",
        price: toNumber(getCellValue(row, headerIndexMap, cols.price)),
        quantity: toNumber(getCellValue(row, headerIndexMap, cols.quantity)),
      });
    })
    .filter(Boolean);

  const skuIds = preparedRows.map((r) => r.skuId).filter(Boolean);
  const existing = await ProductMaster.find(
    { skuId: { $in: skuIds } },
    { skuId: 1, manualSellerSku: 1, manualSellerSkuEnabled: 1, platforms: 1, canonicalPrice: 1 }
  ).lean();
  const existingBySku = new Map(existing.map((r) => [r.skuId, r]));
  const existingSkuIds = new Set(existing.map((r) => r.skuId));

  for (const row of preparedRows) {
    const prev = existingBySku.get(row.skuId);
    if (prev?.manualSellerSkuEnabled && prev.manualSellerSku) {
      row.sellerSku = prev.manualSellerSku;
      row.platforms.tiktok.sellerSku = prev.manualSellerSku;
    }
    if (prev?.platforms?.shopee) {
      row.platforms.shopee = prev.platforms.shopee;
    }
    if (prev?.platforms?.lazada) {
      row.platforms.lazada = prev.platforms.lazada;
    }
    if (prev?.canonicalPrice > 0) {
      row.canonicalPrice = prev.canonicalPrice;
    }
  }

  const bulkOperations = preparedRows
    .filter((row) => row.productId && row.skuId && row.productName)
    .map((row) => ({
      updateOne: {
        filter: { skuId: row.skuId },
        update: { $set: row },
        upsert: true,
      },
    }));

  if (bulkOperations.length > 0) {
    await ProductMaster.bulkWrite(bulkOperations, { ordered: false });
  }

  const inserted = preparedRows.filter((r) => r.skuId && !existingSkuIds.has(r.skuId)).length;
  const updated = preparedRows.filter((r) => r.skuId && existingSkuIds.has(r.skuId)).length;

  return {
    batchId: batch._id,
    batchType: batch.batchType,
    filename: batch.filename,
    inserted,
    updated,
    totalRows: preparedRows.length,
  };
}

function buildShopeeExternalKey(productId, variationId) {
  return `${productId}::${variationId}`;
}

function buildLazadaExternalKey(lazadaSkuId) {
  return String(lazadaSkuId || "").trim();
}

async function importSecondaryPlatformCatalog({ platform, buffer, filename, uploadedBy }) {
  if (platform !== "shopee" && platform !== "lazada") {
    const error = new Error("platform must be shopee or lazada");
    error.statusCode = 400;
    throw error;
  }

  const config = platformTemplates[platform];
  const batchType = platform === "shopee" ? "shopee_catalog" : "lazada_catalog";
  const workbook = getWorkbook(buffer);
  const sheet = workbook.Sheets[config.sheet] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    const error = new Error(`${platform} template sheet not found.`);
    error.statusCode = 400;
    throw error;
  }

  const { headerIndexMap, dataRows } = parseRowsFromConfig(sheet, config);
  const cols = config.columns;
  const fileHash = fileHashFromBuffer(buffer);
  const existingBatch = await Batch.findOne({ fileHash }).lean();
  if (existingBatch) {
    const matchResult = await suggestLinksForPlatform(platform);
    return {
      batchId: existingBatch._id,
      skippedReason: "duplicate_file_hash",
      ...matchResult,
    };
  }

  const batch = await createBatch({
    batchType,
    filename,
    fileHash,
    uploadedBy,
  });

  const pendingOps = [];

  for (const row of dataRows) {
    if (platform === "shopee") {
      const productId = getCellValue(row, headerIndexMap, cols.productId);
      const variationId = getCellValue(row, headerIndexMap, cols.variationId);
      const productName = getCellValue(row, headerIndexMap, cols.productName);
      if (!productId && !variationId && !productName) continue;

      const variationName = getCellValue(row, headerIndexMap, cols.variationName);
      const externalKey = buildShopeeExternalKey(productId, variationId);
      const platformData = {
        productId,
        variationId,
        productName,
        variationName,
        parentSku: getCellValue(row, headerIndexMap, cols.parentSku),
        sellerSku: getCellValue(row, headerIndexMap, cols.sellerSku),
        stock: toNumber(getCellValue(row, headerIndexMap, cols.stock)),
      };

      pendingOps.push({
        updateOne: {
          filter: { platform, externalKey },
          update: {
            $set: {
              platform,
              externalKey,
              batchId: batch._id,
              productName,
              variationName,
              matchKey: buildMatchKey(productName, variationName),
              price: toNumber(getCellValue(row, headerIndexMap, cols.price)),
              stock: platformData.stock,
              platformData,
              status: "pending",
              suggestedProductMasterId: null,
              suggestedSkuId: "",
              matchScore: 0,
            },
          },
          upsert: true,
        },
      });
    }

    if (platform === "lazada") {
      const lazadaSkuId = getCellValue(row, headerIndexMap, cols.lazadaSkuId);
      const productName = getCellValue(row, headerIndexMap, cols.productName);
      if (!lazadaSkuId && !productName) continue;

      const externalKey = buildLazadaExternalKey(lazadaSkuId);
      const platformData = {
        productId: getCellValue(row, headerIndexMap, cols.productId),
        lazadaSkuId,
        shopSku: getCellValue(row, headerIndexMap, cols.shopSku),
        productName,
        quantity: toNumber(getCellValue(row, headerIndexMap, cols.quantity)),
      };

      pendingOps.push({
        updateOne: {
          filter: { platform, externalKey },
          update: {
            $set: {
              platform,
              externalKey,
              batchId: batch._id,
              productName,
              variationName: "",
              matchKey: buildMatchKey(productName, ""),
              price: toNumber(getCellValue(row, headerIndexMap, cols.price)),
              stock: platformData.quantity,
              platformData,
              status: "pending",
              suggestedProductMasterId: null,
              suggestedSkuId: "",
              matchScore: 0,
            },
          },
          upsert: true,
        },
      });
    }
  }

  if (pendingOps.length > 0) {
    await PendingPlatformListing.bulkWrite(pendingOps, { ordered: false });
  }

  const matchResult = await suggestLinksForPlatform(platform);

  return {
    batchId: batch._id,
    batchType: batch.batchType,
    filename: batch.filename,
    importedRows: pendingOps.length,
    ...matchResult,
  };
}

async function importMappingCsv({ platform, rows }) {
  let linked = 0;
  const errors = [];

  for (const [index, row] of rows.entries()) {
    const skuId = String(row.tiktok_sku_id || row.sku_id || "").trim();
    const productMaster = await ProductMaster.findOne({ skuId }).lean();
    if (!productMaster) {
      errors.push({ line: index + 1, message: `TikTok sku not found: ${skuId}` });
      continue;
    }

    let pending = null;
    if (platform === "shopee") {
      const externalKey = buildShopeeExternalKey(
        String(row.shopee_product_id || row.product_id || "").trim(),
        String(row.shopee_variation_id || row.variation_id || "").trim()
      );
      pending = await PendingPlatformListing.findOne({ platform, externalKey }).lean();
    } else {
      const externalKey = buildLazadaExternalKey(
        String(row.lazada_sku_id || row.sku_id || "").trim()
      );
      pending = await PendingPlatformListing.findOne({ platform, externalKey }).lean();
    }

    if (!pending) {
      errors.push({ line: index + 1, message: "pending listing not found for mapping row" });
      continue;
    }

    await confirmLink({
      pendingId: pending._id,
      productMasterId: productMaster._id,
      matchedBy: "csv",
    });
    linked += 1;
  }

  return { linked, errors };
}

module.exports = {
  importTiktokCatalog,
  importShopeeCatalog: (opts) => importSecondaryPlatformCatalog({ platform: "shopee", ...opts }),
  importLazadaCatalog: (opts) => importSecondaryPlatformCatalog({ platform: "lazada", ...opts }),
  importMappingCsv,
};
