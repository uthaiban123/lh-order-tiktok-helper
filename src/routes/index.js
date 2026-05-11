const express = require("express");
const settledSalesRouter = require("./settledSales");
const reportsRouter = require("./reports");
const productMasterRouter = require("./productMaster");

const router = express.Router();

router.use("/reports", reportsRouter);
router.use("/api/tiktok-settled-sales", settledSalesRouter);
router.use("/", productMasterRouter);

module.exports = router;
