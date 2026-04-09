const express = require("express");
const multer = require("multer");
const Batch = require("../models/Batch");
const IncomeEntry = require("../models/IncomeEntry");
const OrderHeader = require("../models/OrderHeader");
const OrderItem = require("../models/OrderItem");
const ProductMaster = require("../models/ProductMaster");
const { parseSellerSku } = require("../utils/sku");
const { buildSummary } = require("../services/summaryService");
const asyncHandler = require("../utils/asyncHandler");
const { initializeCollections } = require("../config/mongodb");
const {
  importOrderWorkbook,
  importIncomeWorkbook,
  importProductMasterWorkbook,
} = require("../services/importService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

router.get("/health", asyncHandler(async (req, res) => {
  const [batchCount, incomeCount, orderItemCount, productMasterCount] = await Promise.all([
    Batch.countDocuments(),
    IncomeEntry.countDocuments(),
    OrderItem.countDocuments(),
    ProductMaster.countDocuments(),
  ]);

  res.json({
    ok: true,
    counts: {
      batches: batchCount,
      incomeEntries: incomeCount,
      orderItems: orderItemCount,
      productMasters: productMasterCount,
    },
  });
}));

router.post("/init-db", asyncHandler(async (req, res) => {
  await initializeCollections();

  const collections = await Batch.db.db.listCollections().toArray();
  res.status(201).json({
    ok: true,
    collections: collections.map((collection) => collection.name).sort(),
  });
}));

router.post("/batches", asyncHandler(async (req, res) => {
  const batch = await Batch.create(req.body);
  res.status(201).json(batch);
}));

router.get("/batches", asyncHandler(async (req, res) => {
  const batches = await Batch.find().sort({ createdAt: -1 }).lean();
  res.json({ items: batches });
}));

router.post("/income-entries", asyncHandler(async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : [req.body];
  const docs = await IncomeEntry.insertMany(payload, { ordered: false });
  res.status(201).json({ inserted: docs.length });
}));

router.post("/order-headers", asyncHandler(async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : [req.body];
  const docs = await OrderHeader.insertMany(payload, { ordered: false });
  res.status(201).json({ inserted: docs.length });
}));

router.post("/order-items", asyncHandler(async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : [req.body];
  const normalized = payload.map((item, index) => {
    const sku = parseSellerSku(item.sellerSku);
    return {
      ...item,
      lineNo: item.lineNo || index + 1,
      sellerSku: sku.sellerSku,
      baseProductCode: item.baseProductCode || sku.baseProductCode,
      packMultiplier: item.packMultiplier || sku.packMultiplier,
    };
  });

  const docs = await OrderItem.insertMany(normalized, { ordered: false });
  res.status(201).json({ inserted: docs.length });
}));

router.post(
  "/import/product-master",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const result = await importProductMasterWorkbook({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      uploadedBy: String(req.body.uploadedBy || "web-import").trim(),
    });

    const statusCode =
      result.skippedReason === "duplicate_file_hash" ||
      (result.insertedProductMasters === 0 && result.updatedProductMasters === 0)
        ? 200
        : 201;

    return res.status(statusCode).json(result);
  })
);

router.post(
  "/import/orders",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const result = await importOrderWorkbook({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      uploadedBy: String(req.body.uploadedBy || "web-import").trim(),
    });

    return res.status(201).json(result);
  })
);

router.post(
  "/import/income",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const result = await importIncomeWorkbook({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      uploadedBy: String(req.body.uploadedBy || "web-import").trim(),
    });

    const statusCode =
      result.skippedReason === "duplicate_file_hash" || result.insertedIncomeEntries === 0
        ? 200
        : 201;

    return res.status(statusCode).json(result);
  })
);

router.get("/daily-summary", asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: "date is required. Use YYYY-MM-DD." });
  }

  const summary = await buildSummary({ settlementDate: date });
  return res.json({ date, ...summary });
}));

router.get("/monthly-summary", asyncHandler(async (req, res) => {
  const { month } = req.query;
  if (!month) {
    return res.status(400).json({ error: "month is required. Use YYYY-MM." });
  }

  const summary = await buildSummary({ month });
  return res.json({ month, ...summary });
}));

module.exports = router;
