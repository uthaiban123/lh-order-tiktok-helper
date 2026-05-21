const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const ProductMaster = require("../models/ProductMaster");
const platformTemplates = require("../config/platformTemplates");
const {
  getWorkbook,
  parseRowsFromConfig,
  setCellValue,
  buildHeaderIndexMap,
  normalizeHeader,
} = require("../utils/workbook");

const TEMPLATES_DIR = path.join(__dirname, "..", "..", "templates");

function getExportPrice(product, platform) {
  const override = product.priceOverrides?.[platform];
  if (override !== undefined && override !== null && override !== "") {
    return Number(override);
  }
  if (product.canonicalPrice > 0) {
    return product.canonicalPrice;
  }
  return Number(product.price || product.platforms?.tiktok?.price || 0);
}

function loadTemplateWorkbook(platform) {
  const config = platformTemplates[platform];
  const filePath = path.join(TEMPLATES_DIR, config.exportTemplateFile);
  if (!fs.existsSync(filePath)) {
    const error = new Error(`Template file not found for ${platform}: ${config.exportTemplateFile}`);
    error.statusCode = 500;
    throw error;
  }
  return {
    config,
    buffer: fs.readFileSync(filePath),
    workbook: XLSX.readFile(filePath),
  };
}

function columnIndexMap(headers, columnDefs) {
  const headerMap = buildHeaderIndexMap(headers);
  const result = {};
  for (const [key, aliases] of Object.entries(columnDefs)) {
    for (const alias of aliases) {
      const index = headerMap.get(normalizeHeader(alias));
      if (index !== undefined) {
        result[key] = index;
        break;
      }
    }
  }
  return result;
}

async function queryProductsForExport(platform) {
  if (platform === "tiktok") {
    return ProductMaster.find({ skuId: { $exists: true, $ne: "" } }).lean();
  }

  const linkFilter = { [`platforms.${platform}.linkStatus`]: { $in: ["linked", "manual"] } };
  return ProductMaster.find(linkFilter).lean();
}

function buildTiktokExportRows(products, config) {
  const { workbook, buffer } = loadTemplateWorkbook("tiktok");
  const sheet = workbook.Sheets[config.sheet];
  const { headers, allRows } = parseRowsFromConfig(sheet, config);
  const colMap = columnIndexMap(headers, config.columns);

  const dataStart = config.dataStartRow;
  const templateDataRowCount = Math.max(0, allRows.length - dataStart);
  const exportCount = Math.max(products.length, templateDataRowCount);

  for (let index = 0; index < exportCount; index += 1) {
    const rowIndex = dataStart + index;
    const product = products[index];
    if (!product) continue;

    const price = getExportPrice(product, "tiktok");
    const tiktok = product.platforms?.tiktok || {};

    if (colMap.productId !== undefined) setCellValue(sheet, rowIndex, colMap.productId, product.productId);
    if (colMap.category !== undefined) setCellValue(sheet, rowIndex, colMap.category, product.category || "");
    if (colMap.productName !== undefined) setCellValue(sheet, rowIndex, colMap.productName, product.productName);
    if (colMap.skuId !== undefined) setCellValue(sheet, rowIndex, colMap.skuId, product.skuId);
    if (colMap.variationValue !== undefined) {
      setCellValue(sheet, rowIndex, colMap.variationValue, product.variationValue || "");
    }
    if (colMap.price !== undefined) setCellValue(sheet, rowIndex, colMap.price, price);
    if (colMap.quantity !== undefined) {
      setCellValue(sheet, rowIndex, colMap.quantity, product.quantity ?? tiktok.quantity ?? 0);
    }
    if (colMap.sellerSku !== undefined) setCellValue(sheet, rowIndex, colMap.sellerSku, product.sellerSku || "");
  }

  return {
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    rowCount: products.length,
    sourceTemplate: buffer,
  };
}

function buildShopeeExportRows(products, config) {
  const { workbook, buffer } = loadTemplateWorkbook("shopee");
  const sheet = workbook.Sheets[config.sheet];
  const { headers } = parseRowsFromConfig(sheet, config);
  const colMap = columnIndexMap(headers, config.columns);
  const dataStart = config.dataStartRow;

  products.forEach((product, index) => {
    const shopee = product.platforms?.shopee || {};
    const rowIndex = dataStart + index;
    const price = getExportPrice(product, "shopee");

    if (colMap.productId !== undefined) setCellValue(sheet, rowIndex, colMap.productId, shopee.productId || "");
    if (colMap.productName !== undefined) setCellValue(sheet, rowIndex, colMap.productName, shopee.productName || product.productName);
    if (colMap.variationId !== undefined) setCellValue(sheet, rowIndex, colMap.variationId, shopee.variationId || "");
    if (colMap.variationName !== undefined) {
      setCellValue(sheet, rowIndex, colMap.variationName, shopee.variationName || "");
    }
    if (colMap.parentSku !== undefined) setCellValue(sheet, rowIndex, colMap.parentSku, shopee.parentSku || "");
    if (colMap.sellerSku !== undefined) setCellValue(sheet, rowIndex, colMap.sellerSku, shopee.sellerSku || "");
    if (colMap.price !== undefined) setCellValue(sheet, rowIndex, colMap.price, price);
    if (colMap.stock !== undefined) setCellValue(sheet, rowIndex, colMap.stock, shopee.stock ?? 0);
  });

  return {
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    rowCount: products.length,
    sourceTemplate: buffer,
  };
}

function buildLazadaExportRows(products, config) {
  const { workbook, buffer } = loadTemplateWorkbook("lazada");
  const sheet = workbook.Sheets[config.sheet];
  const { headers } = parseRowsFromConfig(sheet, config);
  const colMap = columnIndexMap(headers, config.columns);
  const dataStart = config.dataStartRow;

  products.forEach((product, index) => {
    const lazada = product.platforms?.lazada || {};
    const rowIndex = dataStart + index;
    const price = getExportPrice(product, "lazada");

    if (colMap.productId !== undefined) setCellValue(sheet, rowIndex, colMap.productId, lazada.productId || "");
    if (colMap.productName !== undefined) {
      setCellValue(sheet, rowIndex, colMap.productName, lazada.productName || product.productName);
    }
    if (colMap.lazadaSkuId !== undefined) setCellValue(sheet, rowIndex, colMap.lazadaSkuId, lazada.lazadaSkuId || "");
    if (colMap.shopSku !== undefined) setCellValue(sheet, rowIndex, colMap.shopSku, lazada.shopSku || "");
    if (colMap.quantity !== undefined) setCellValue(sheet, rowIndex, colMap.quantity, lazada.quantity ?? 0);
    if (colMap.price !== undefined) setCellValue(sheet, rowIndex, colMap.price, price);
  });

  return {
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    rowCount: products.length,
    sourceTemplate: buffer,
  };
}

async function exportPlatformWorkbook(platform) {
  const config = platformTemplates[platform];
  const products = await queryProductsForExport(platform);

  if (platform === "tiktok") {
    return { platform, filename: `tiktok_batch_edit_${Date.now()}.xlsx`, ...buildTiktokExportRows(products, config) };
  }
  if (platform === "shopee") {
    return { platform, filename: `shopee_mass_update_${Date.now()}.xlsx`, ...buildShopeeExportRows(products, config) };
  }
  if (platform === "lazada") {
    return { platform, filename: `lazada_price_stock_${Date.now()}.xlsx`, ...buildLazadaExportRows(products, config) };
  }

  const error = new Error("unsupported platform");
  error.statusCode = 400;
  throw error;
}

async function buildExportPreview() {
  const [tiktok, shopee, lazada, allMasters] = await Promise.all([
    queryProductsForExport("tiktok"),
    queryProductsForExport("shopee"),
    queryProductsForExport("lazada"),
    ProductMaster.countDocuments(),
  ]);

  const shopeeLinked = await ProductMaster.countDocuments({
    "platforms.shopee.linkStatus": { $in: ["linked", "manual"] },
  });
  const lazadaLinked = await ProductMaster.countDocuments({
    "platforms.lazada.linkStatus": { $in: ["linked", "manual"] },
  });

  const items = tiktok.slice(0, 500).map((product) => ({
    skuId: product.skuId,
    sellerSku: product.sellerSku,
    productName: product.productName,
    variationValue: product.variationValue,
    canonicalPrice: product.canonicalPrice || product.price,
    prices: {
      tiktok: getExportPrice(product, "tiktok"),
      shopee:
        product.platforms?.shopee?.linkStatus === "linked" || product.platforms?.shopee?.linkStatus === "manual"
          ? getExportPrice(product, "shopee")
          : null,
      lazada:
        product.platforms?.lazada?.linkStatus === "linked" || product.platforms?.lazada?.linkStatus === "manual"
          ? getExportPrice(product, "lazada")
          : null,
    },
    linkStatus: {
      shopee: product.platforms?.shopee?.linkStatus || "unlinked",
      lazada: product.platforms?.lazada?.linkStatus || "unlinked",
    },
  }));

  return {
    counts: {
      productMasters: allMasters,
      tiktokExportRows: tiktok.length,
      shopeeExportRows: shopee.length,
      lazadaExportRows: lazada.length,
      shopeeLinked,
      lazadaLinked,
    },
    items,
  };
}

async function exportAllPlatformsZip() {
  const archiver = require("archiver");
  const { PassThrough } = require("stream");

  const platforms = ["tiktok", "shopee", "lazada"];
  const files = await Promise.all(platforms.map((p) => exportPlatformWorkbook(p)));

  return new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    archive.pipe(stream);

    for (const file of files) {
      archive.append(file.buffer, { name: file.filename });
    }
    archive.finalize();
  });
}

module.exports = {
  getExportPrice,
  exportPlatformWorkbook,
  exportAllPlatformsZip,
  buildExportPreview,
};
