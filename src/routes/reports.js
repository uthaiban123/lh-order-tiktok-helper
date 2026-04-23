const express = require("express");
const { buildSummary } = require("../services/summaryService");
const asyncHandler = require("../utils/asyncHandler");
const { formatMoney, formatNumber, formatPercent } = require("../utils/format");
const { buildCsv } = require("../utils/csv");

const router = express.Router();

function roundCsvNumber(value, fractionDigits = 2) {
  const numeric = Number(value || 0);
  return Number(numeric.toFixed(fractionDigits));
}

function downloadCsv(res, filename, columns, rows) {
  const csv = buildCsv(columns, rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(`\uFEFF${csv}`);
}

function getViewHelpers() {
  return {
    formatMoney,
    formatNumber,
    formatPercent,
  };
}

router.get("/", (req, res) => {
  res.render("reports/index", {
    title: "รายงาน TikTok",
    today: new Date().toISOString().slice(0, 10),
    currentMonth: new Date().toISOString().slice(0, 7),
  });
});

router.get(
  "/daily/export",
  asyncHandler(async (req, res) => {
    const date = String(req.query.date || "").trim();
    if (!date) {
      return res.redirect("/reports");
    }

    const summary = await buildSummary({ settlementDate: date });
    const columns = [
      { key: "sellerSku", label: "seller_sku" },
      { key: "baseProductCode", label: "base_product_code" },
      { key: "productName", label: "product_name" },
      { key: "ordersCount", label: "orders_count" },
      { key: "soldUnitsTikTok", label: "sold_units_tiktok" },
      { key: "packMultiplier", label: "pack_multiplier" },
      { key: "equivalentBaseUnits", label: "equivalent_base_units" },
      {
        label: "average_revenue_per_unit",
        value: (row) =>
          row.soldUnitsTikTok > 0
            ? roundCsvNumber(row.allocatedRevenueAmount / row.soldUnitsTikTok)
            : "",
      },
      {
        key: "allocatedRevenueAmount",
        label: "allocated_revenue_amount",
        value: (row) => roundCsvNumber(row.allocatedRevenueAmount),
      },
      {
        key: "receivedSettlementAmount",
        label: "received_settlement_amount",
        value: (row) => roundCsvNumber(row.receivedSettlementAmount),
      },
    ];

    return downloadCsv(
      res,
      `tiktok-daily-summary-${date}.csv`,
      columns,
      summary.skuSummary || []
    );
  })
);

router.get(
  "/daily",
  asyncHandler(async (req, res) => {
    const date = String(req.query.date || "").trim();
    if (!date) {
      return res.redirect("/reports");
    }

    const summary = await buildSummary({ settlementDate: date });
    return res.render("reports/daily", {
      title: `รายงานรายวัน ${date}`,
      mode: "daily",
      periodLabel: date,
      summary,
      ...getViewHelpers(),
    });
  })
);

router.get(
  "/monthly/export",
  asyncHandler(async (req, res) => {
    const month = String(req.query.month || "").trim();
    if (!month) {
      return res.redirect("/reports");
    }

    const summary = await buildSummary({ month });
    const columns = [
      { key: "baseProductCode", label: "base_product_code" },
      { key: "productName", label: "product_name" },
      { key: "ordersCount", label: "orders_count" },
      { key: "soldUnitsTikTok", label: "sold_units_tiktok" },
      { key: "equivalentBaseUnits", label: "equivalent_base_units" },
      {
        label: "average_revenue_per_unit",
        value: (row) =>
          row.soldUnitsTikTok > 0
            ? roundCsvNumber(row.allocatedRevenueAmount / row.soldUnitsTikTok)
            : "",
      },
      {
        key: "allocatedRevenueAmount",
        label: "allocated_revenue_amount",
        value: (row) => roundCsvNumber(row.allocatedRevenueAmount),
      },
      {
        key: "receivedSettlementAmount",
        label: "received_settlement_amount",
        value: (row) => roundCsvNumber(row.receivedSettlementAmount),
      },
    ];

    return downloadCsv(
      res,
      `tiktok-monthly-erp-summary-${month}.csv`,
      columns,
      summary.baseProductSummary || []
    );
  })
);

router.get(
  "/monthly",
  asyncHandler(async (req, res) => {
    const month = String(req.query.month || "").trim();
    if (!month) {
      return res.redirect("/reports");
    }

    const summary = await buildSummary({ month });
    return res.render("reports/monthly", {
      title: `รายงานรายเดือน ${month}`,
      mode: "monthly",
      periodLabel: month,
      summary,
      ...getViewHelpers(),
    });
  })
);

module.exports = router;
