const express = require("express");
const { buildSummary } = require("../services/summaryService");
const asyncHandler = require("../utils/asyncHandler");
const { formatMoney, formatNumber, formatPercent } = require("../utils/format");

const router = express.Router();

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
