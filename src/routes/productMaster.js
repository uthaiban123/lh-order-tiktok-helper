const express = require("express");
const ProductMaster = require("../models/ProductMaster");
const asyncHandler = require("../utils/asyncHandler");
const { parseSellerSku } = require("../utils/sku");

const router = express.Router();

function getEffectiveSellerSku(doc) {
  if (doc.manualSellerSkuEnabled && doc.manualSellerSku) {
    return doc.manualSellerSku;
  }
  return doc.sellerSku || "";
}

router.get("/product-master", (req, res) => {
  res.render("product-master/index", {
    title: "จัดการ Product Master",
  });
});

router.get(
  "/api/product-master",
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = search
      ? {
          $or: [
            { productId: { $regex: search, $options: "i" } },
            { skuId: { $regex: search, $options: "i" } },
            { sellerSku: { $regex: search, $options: "i" } },
            { manualSellerSku: { $regex: search, $options: "i" } },
            { productName: { $regex: search, $options: "i" } },
            { baseProductCode: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      ProductMaster.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProductMaster.countDocuments(filter),
    ]);

    const enriched = items.map((item) => {
      const effectiveSku = getEffectiveSellerSku(item);
      const parsed = parseSellerSku(effectiveSku);
      return {
        ...item,
        effectiveSellerSku: effectiveSku,
        computedBaseProductCode: parsed.baseProductCode,
        computedPackMultiplier: parsed.packMultiplier,
      };
    });

    res.json({
      items: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

router.get(
  "/api/product-master/:id",
  asyncHandler(async (req, res) => {
    const item = await ProductMaster.findById(req.params.id).lean();
    if (!item) {
      return res.status(404).json({ error: "Not found" });
    }
    const effectiveSku = getEffectiveSellerSku(item);
    const parsed = parseSellerSku(effectiveSku);
    res.json({
      ...item,
      effectiveSellerSku: effectiveSku,
      computedBaseProductCode: parsed.baseProductCode,
      computedPackMultiplier: parsed.packMultiplier,
    });
  })
);

router.post(
  "/api/product-master",
  asyncHandler(async (req, res) => {
    const payload = {
      productId: String(req.body.productId || "").trim(),
      skuId: String(req.body.skuId || "").trim(),
      sellerSku: String(req.body.sellerSku || "").trim(),
      manualSellerSku: String(req.body.manualSellerSku || "").trim(),
      manualSellerSkuEnabled: Boolean(req.body.manualSellerSkuEnabled),
      productName: String(req.body.productName || "").trim(),
      variationValue: String(req.body.variationValue || "").trim(),
      category: String(req.body.category || "").trim(),
      brand: String(req.body.brand || "").trim(),
      price: Number(req.body.price) || 0,
      quantity: Number(req.body.quantity) || 0,
      baseProductCode: String(req.body.baseProductCode || "").trim(),
      packMultiplier: Math.max(1, Number(req.body.packMultiplier) || 1),
    };

    if (!payload.productId || !payload.skuId || !payload.productName) {
      return res
        .status(400)
        .json({ error: "productId, skuId และ productName จำเป็นต้องมี" });
    }

    const existing = await ProductMaster.findOne({ skuId: payload.skuId }).lean();
    if (existing) {
      return res.status(409).json({ error: "skuId นี้มีอยู่แล้ว" });
    }

    const item = await ProductMaster.create(payload);
    res.status(201).json(item);
  })
);

router.put(
  "/api/product-master/:id",
  asyncHandler(async (req, res) => {
    const update = {
      productId: String(req.body.productId || "").trim(),
      skuId: String(req.body.skuId || "").trim(),
      sellerSku: String(req.body.sellerSku || "").trim(),
      manualSellerSku: String(req.body.manualSellerSku || "").trim(),
      manualSellerSkuEnabled: Boolean(req.body.manualSellerSkuEnabled),
      productName: String(req.body.productName || "").trim(),
      variationValue: String(req.body.variationValue || "").trim(),
      category: String(req.body.category || "").trim(),
      brand: String(req.body.brand || "").trim(),
      price: Number(req.body.price) || 0,
      quantity: Number(req.body.quantity) || 0,
      baseProductCode: String(req.body.baseProductCode || "").trim(),
      packMultiplier: Math.max(1, Number(req.body.packMultiplier) || 1),
    };

    if (!update.productId || !update.skuId || !update.productName) {
      return res
        .status(400)
        .json({ error: "productId, skuId และ productName จำเป็นต้องมี" });
    }

    const existing = await ProductMaster.findOne({
      skuId: update.skuId,
      _id: { $ne: req.params.id },
    }).lean();
    if (existing) {
      return res.status(409).json({ error: "skuId นี้มีอยู่แล้ว" });
    }

    const item = await ProductMaster.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!item) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(item);
  })
);

router.delete(
  "/api/product-master/:id",
  asyncHandler(async (req, res) => {
    const item = await ProductMaster.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ ok: true, deletedId: req.params.id });
  })
);

module.exports = router;
