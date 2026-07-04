const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const {
  formatMoney,
  formatNumber,
  formatPercent,
  formatIsoDateTh,
  formatPeriodLabel,
} = require("../utils/format");
const { buildCsv } = require("../utils/csv");
const { buildProductCount } = require("../services/productCountService");

const router = express.Router();

function getViewHelpers() {
  return {
    formatMoney,
    formatNumber,
    formatPercent,
    formatIsoDateTh,
    formatPeriodLabel,
  };
}

router.get("/", (req, res) => {
  res.render("product-count/index", {
    title: "นับจำนวนสินค้า",
    today: new Date().toISOString().slice(0, 10),
    ...getViewHelpers(),
  });
});

router.get(
  "/report",
  asyncHandler(async (req, res) => {
    const startDate = String(req.query.startDate || "").trim();
    const endDate = String(req.query.endDate || "").trim();
    const sellerSkus = String(req.query.sellerSkus || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const autoPrint = String(req.query.print || "").trim() === "1";

    if (!startDate || !endDate || !sellerSkus.length) {
      return res.redirect("/product-count");
    }

    const result = await buildProductCount({
      startDate,
      endDate,
      sellerSkus,
    });

    const generatedAt = new Intl.DateTimeFormat("th-TH", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date());

    return res.render("product-count/report", {
      title: `รายงานนับจำนวนสินค้า ${result.startDate} – ${result.endDate}`,
      result,
      generatedAt,
      autoPrint,
      ...getViewHelpers(),
    });
  })
);
router.get(
  "/export",
  asyncHandler(async (req, res) => {
    const startDate = String(req.query.startDate || "").trim();
    const endDate = String(req.query.endDate || "").trim();
    const sellerSkus = String(req.query.sellerSkus || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const result = await buildProductCount({
      startDate,
      endDate,
      sellerSkus,
    });

    const columns = [
      { key: "sellerSku", label: "seller_sku" },
      { key: "productName", label: "product_name" },
      { key: "baseProductCode", label: "base_product_code" },
      { key: "packMultiplier", label: "pack_multiplier" },
      { key: "ordersCount", label: "orders_count" },
      { key: "soldUnitsTikTok", label: "sold_units_tiktok" },
      { key: "equivalentBaseUnits", label: "equivalent_base_units" },
    ];

    const csv = buildCsv(columns, result.items);
    const filename = `product-count-${result.startDate}_to_${result.endDate}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(`\uFEFF${csv}`);
  })
);

module.exports = router;
