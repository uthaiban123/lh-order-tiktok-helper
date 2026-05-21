const express = require("express");
const settledSalesRouter = require("./settledSales");
const reportsRouter = require("./reports");
const productMasterRouter = require("./productMaster");
const priceSyncRouter = require("./priceSync");

const router = express.Router();

router.use("/reports", reportsRouter);
router.use("/api/tiktok-settled-sales", settledSalesRouter);
router.use("/", priceSyncRouter);
router.use("/", productMasterRouter);

module.exports = router;
