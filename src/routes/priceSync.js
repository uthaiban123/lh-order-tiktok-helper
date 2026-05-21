const express = require("express");
const multer = require("multer");
const ProductMaster = require("../models/ProductMaster");
const asyncHandler = require("../utils/asyncHandler");
const { toNumber } = require("../utils/number");
const {
  importTiktokCatalog,
  importShopeeCatalog,
  importLazadaCatalog,
  importMappingCsv,
} = require("../services/platformCatalogImportService");
const {
  listPending,
  confirmLink,
  skipPending,
  suggestLinksForPlatform,
} = require("../services/productMatchingService");
const {
  exportPlatformWorkbook,
  exportAllPlatformsZip,
  buildExportPreview,
} = require("../services/priceExportService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.get("/price-sync", (req, res) => {
  res.render("price-sync/index", { title: "ซิงค์ราคา Multi-Platform" });
});

router.get(
  "/api/price-sync/products",
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = search
      ? {
          $or: [
            { skuId: { $regex: search, $options: "i" } },
            { sellerSku: { $regex: search, $options: "i" } },
            { productName: { $regex: search, $options: "i" } },
            { matchKey: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      ProductMaster.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      ProductMaster.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  })
);

router.get(
  "/api/price-sync/preview",
  asyncHandler(async (req, res) => {
    const preview = await buildExportPreview();
    res.json(preview);
  })
);

router.get(
  "/api/price-sync/tiktok-picklist",
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || "").trim();
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 15));

    const filter = search
      ? {
          $or: [
            { skuId: { $regex: search, $options: "i" } },
            { sellerSku: { $regex: search, $options: "i" } },
            { productName: { $regex: search, $options: "i" } },
            { variationValue: { $regex: search, $options: "i" } },
            { matchKey: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const items = await ProductMaster.find(filter, {
      _id: 1,
      skuId: 1,
      sellerSku: 1,
      productName: 1,
      variationValue: 1,
      canonicalPrice: 1,
      price: 1,
    })
      .sort({ productName: 1, variationValue: 1 })
      .limit(limit)
      .lean();

    res.json({
      items: items.map((item) => ({
        _id: item._id,
        skuId: item.skuId,
        sellerSku: item.sellerSku || "",
        productName: item.productName,
        variationValue: item.variationValue || "",
        price: item.canonicalPrice > 0 ? item.canonicalPrice : item.price,
      })),
    });
  })
);

router.get(
  "/api/price-sync/pending",
  asyncHandler(async (req, res) => {
    const platform = String(req.query.platform || "shopee");
    const status = String(req.query.status || "suggested");
    const page = Number(req.query.page) || 1;
    const limit = Math.min(100, Number(req.query.limit) || 30);
    const result = await listPending({ platform, status, page, limit });
    res.json(result);
  })
);

router.post(
  "/api/price-sync/mappings/confirm",
  asyncHandler(async (req, res) => {
    const pendingId = req.body.pendingId;
    const productMasterId = req.body.productMasterId;
    if (!pendingId || !productMasterId) {
      return res.status(400).json({ error: "pendingId and productMasterId are required" });
    }
    const result = await confirmLink({
      pendingId,
      productMasterId,
      matchedBy: req.body.matchedBy || "manual",
    });
    res.json(result);
  })
);

router.post(
  "/api/price-sync/mappings/skip",
  asyncHandler(async (req, res) => {
    const pendingId = req.body.pendingId;
    if (!pendingId) {
      return res.status(400).json({ error: "pendingId is required" });
    }
    const result = await skipPending(pendingId);
    res.json(result);
  })
);

router.post(
  "/api/price-sync/mappings/suggest",
  asyncHandler(async (req, res) => {
    const platform = String(req.body.platform || "shopee");
    const result = await suggestLinksForPlatform(platform);
    res.json(result);
  })
);

router.patch(
  "/api/price-sync/bulk",
  asyncHandler(async (req, res) => {
    const mode = String(req.body.mode || "set");
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }

    let updated = 0;
    for (const item of items) {
      const skuId = String(item.tiktok_sku_id || item.skuId || "").trim();
      const sellerSku = String(item.seller_sku || item.sellerSku || "").trim();
      const filter = skuId ? { skuId } : sellerSku ? { sellerSku } : null;
      if (!filter) continue;

      const product = await ProductMaster.findOne(filter);
      if (!product) continue;

      const base = product.canonicalPrice > 0 ? product.canonicalPrice : product.price;
      let newPrice = toNumber(item.new_price ?? item.newPrice);
      if (mode === "percent") {
        const percent = toNumber(item.percent);
        newPrice = Math.round(base * (1 + percent / 100) * 100) / 100;
      }

      product.canonicalPrice = newPrice;
      await product.save();
      updated += 1;
    }

    res.json({ ok: true, updated });
  })
);

router.patch(
  "/api/price-sync/products/:skuId",
  asyncHandler(async (req, res) => {
    const product = await ProductMaster.findOne({ skuId: req.params.skuId });
    if (!product) {
      return res.status(404).json({ error: "not found" });
    }

    if (req.body.canonicalPrice !== undefined) {
      product.canonicalPrice = toNumber(req.body.canonicalPrice);
    }
    if (req.body.priceOverrides) {
      product.priceOverrides = {
        ...(product.priceOverrides || {}),
        ...req.body.priceOverrides,
      };
    }

    await product.save();
    res.json({ ok: true, item: product.toObject() });
  })
);

router.post(
  "/api/price-sync/import/tiktok",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "file is required" });
    const result = await importTiktokCatalog({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      uploadedBy: String(req.body.uploadedBy || "price-sync").trim(),
    });
    res.status(result.skippedReason ? 200 : 201).json(result);
  })
);

router.post(
  "/api/price-sync/import/shopee",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "file is required" });
    const result = await importShopeeCatalog({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      uploadedBy: String(req.body.uploadedBy || "price-sync").trim(),
    });
    res.status(result.skippedReason ? 200 : 201).json(result);
  })
);

router.post(
  "/api/price-sync/import/lazada",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "file is required" });
    const result = await importLazadaCatalog({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      uploadedBy: String(req.body.uploadedBy || "price-sync").trim(),
    });
    res.status(result.skippedReason ? 200 : 201).json(result);
  })
);

router.post(
  "/api/price-sync/mappings/import-csv",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const platform = String(req.body.platform || "shopee");
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const text = req.file.buffer.toString("utf8");
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const values = line.split(",");
      const row = {};
      headers.forEach((header, index) => {
        row[header] = (values[index] || "").trim();
      });
      return row;
    });

    const result = await importMappingCsv({ platform, rows });
    res.json(result);
  })
);

router.get(
  "/api/price-sync/export",
  asyncHandler(async (req, res) => {
    const platform = String(req.query.platform || "all");

    if (platform === "all") {
      const zipBuffer = await exportAllPlatformsZip();
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="price_sync_export.zip"');
      return res.send(zipBuffer);
    }

    const file = await exportPlatformWorkbook(platform);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    return res.send(file.buffer);
  })
);

module.exports = router;
