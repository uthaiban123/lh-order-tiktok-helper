const express = require("express");
const settledSalesRouter = require("./settledSales");
const reportsRouter = require("./reports");

const router = express.Router();

router.use("/reports", reportsRouter);
router.use("/api/tiktok-settled-sales", settledSalesRouter);

module.exports = router;
