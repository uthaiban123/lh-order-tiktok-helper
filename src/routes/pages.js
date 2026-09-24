const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.render("dashboard", {
    title: "แดชบอร์ด",
    active: "dashboard",
    pageTitle: "แดชบอร์ด",
  });
});

router.get("/imports", (req, res) => {
  res.render("imports/index", {
    title: "นำเข้าข้อมูล",
    active: "imports",
    pageTitle: "นำเข้าข้อมูล",
  });
});

module.exports = router;
