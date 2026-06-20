require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { buildSummary } = require("../src/services/summaryService");

const DATE = "2026-06-18";
const FOLDER = "18-06-69";

function parseCsv(content) {
  const lines = content.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] || "").trim()]));
  });
}

function normSku(s) {
  s = String(s || "").trim();
  if (!s) return "(empty)";
  const m = s.match(/^(.+)-(\d+)$/);
  return m ? m[1] : s;
}

function packFromSku(s) {
  const m = String(s || "").match(/-(\d+)$/);
  return m ? Number(m[1]) : 1;
}

async function main() {
  const pdfSku = parseCsv(
    fs.readFileSync(path.join(FOLDER, "สรุปยอดขายตาม_Seller_SKU_18-06-69.csv"), "utf8")
  );
  const pdfItems = parseCsv(
    fs.readFileSync(path.join(FOLDER, "สรุปบิลการขาย_PDF_18-06-69_รายละเอียดสินค้า.csv"), "utf8")
  );
  const pdfOrders = parseCsv(
    fs.readFileSync(path.join(FOLDER, "สรุปบิลการขาย_PDF_18-06-69_รายการออเดอร์.csv"), "utf8")
  );

  const mongoUri = process.env.MONGODB_URI;
  const dbName = process.env.DATABASE_NAME;
  await mongoose.connect(mongoUri, { dbName });

  const summary = await buildSummary({ settlementDate: DATE });

  const pdfBySeller = new Map();
  const pdfByBase = new Map();
  for (const row of pdfItems) {
    const sku = row["Seller SKU"] || "(empty)";
    const qty = Number(row["จำนวน (ชิ้น)"] || 0);
    pdfBySeller.set(sku, (pdfBySeller.get(sku) || 0) + qty);
    const base = normSku(sku);
    pdfByBase.set(base, (pdfByBase.get(base) || 0) + qty * packFromSku(sku));
  }

  console.log("=== ภาพรวม ===");
  console.log("PDF orders:", pdfOrders.length);
  console.log("ระบบ settled orders:", summary.sourceStats.settledOrders);
  console.log("ระบบ matched orders:", summary.sourceStats.matchedOrders);
  console.log("PDF item qty รวม:", pdfItems.reduce((s, r) => s + Number(r["จำนวน (ชิ้น)"] || 0), 0));
  console.log(
    "ระบบ soldUnitsTikTok รวม:",
    summary.skuSummary.reduce((s, r) => s + Number(r.soldUnitsTikTok || 0), 0)
  );
  console.log(
    "ระบบ equivalentBaseUnits รวม:",
    summary.skuSummary.reduce((s, r) => s + Number(r.equivalentBaseUnits || 0), 0)
  );

  console.log("\n=== เปรียบเทียบ seller SKU (ตามรายงานระบบ) ===");
  const sysSeller = new Map(summary.skuSummary.map((r) => [r.sellerSku || "(empty)", r.soldUnitsTikTok]));
  const allSeller = new Set([...pdfBySeller.keys(), ...sysSeller.keys()]);
  let sellerDiffs = 0;
  for (const sku of [...allSeller].sort()) {
    const p = pdfBySeller.get(sku) || 0;
    const s = sysSeller.get(sku) || 0;
    if (p !== s) {
      sellerDiffs += 1;
      console.log(`${sku}: PDF=${p} | ระบบ=${s} | ต่าง=${s - p}`);
    }
  }
  if (!sellerDiffs) console.log("✅ seller SKU ตรงกันทุกรายการ");

  console.log("\n=== เปรียบเทียบ base product (equivalent units) ===");
  const sysBase = new Map(
    (summary.baseProductSummary || []).map((r) => [r.baseProductCode || "(empty)", r.equivalentBaseUnits])
  );
  const allBase = new Set([...pdfByBase.keys(), ...sysBase.keys()]);
  let baseDiffs = 0;
  for (const base of [...allBase].sort()) {
    const p = pdfByBase.get(base) || 0;
    const s = sysBase.get(base) || 0;
    if (p !== s) {
      baseDiffs += 1;
      console.log(`${base}: PDF=${p} | ระบบ=${s} | ต่าง=${s - p}`);
    } else {
      console.log(`${base}: ${p} ✅`);
    }
  }

  console.log("\n=== รายงานระบบ (seller SKU) ===");
  for (const row of summary.skuSummary) {
    console.log(
      `${row.sellerSku}: ${row.soldUnitsTikTok} ชิ้น` +
        (row.packMultiplier > 1 ? ` = ${row.equivalentBaseUnits} base` : "")
    );
  }

  await mongoose.disconnect();

  console.log("\n=== สรุป ===");
  if (
    pdfOrders.length === summary.sourceStats.settledOrders &&
    sellerDiffs === 0
  ) {
    console.log("✅ จำนวนการขายถูกต้องครบ (orders + seller SKU qty)");
  } else if (pdfOrders.length === summary.sourceStats.settledOrders && baseDiffs === 0) {
    console.log("✅ จำนวน order และ base units ตรงกัน (ต่างแค่ชื่อ SKU ใน PDF)");
  } else if (pdfOrders.length === summary.sourceStats.settledOrders) {
    console.log("⚠️ จำนวน order ตรง แต่ qty ไม่ตรง — ต้องตรวจรายการสินค้า");
  } else {
    console.log("❌ จำนวน order ไม่ตรง");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
