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

async function main() {
  const pdfSkuRows = parseCsv(
    fs.readFileSync(path.join(FOLDER, "สรุปยอดขายตาม_Seller_SKU_18-06-69.csv"), "utf8")
  );

  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DATABASE_NAME });
  const summary = await buildSummary({ settlementDate: DATE });
  await mongoose.disconnect();

  const pdfTotal = pdfSkuRows.reduce((s, r) => s + Number(r["จำนวนที่ขาย (ชิ้น)"] || 0), 0);
  const sysTotal = summary.skuSummary.reduce((s, r) => s + Number(r.soldUnitsTikTok || 0), 0);

  // รวม PDF ที่ใช้ base SKU กับระบบที่แยก pack suffix
  const pdfGrouped = new Map();
  for (const row of pdfSkuRows) {
    const sku = row["Seller SKU"];
    pdfGrouped.set(sku, (pdfGrouped.get(sku) || 0) + Number(row["จำนวนที่ขาย (ชิ้น)"] || 0));
  }

  const sysGrouped = new Map();
  for (const row of summary.skuSummary) {
    const base = String(row.baseProductCode || row.sellerSku).replace(/-\d+$/, "");
    sysGrouped.set(base, (sysGrouped.get(base) || 0) + Number(row.soldUnitsTikTok || 0));
  }

  console.log("PDF SKU summary รวม:", pdfTotal);
  console.log("ระบบ soldUnitsTikTok รวม:", sysTotal);
  console.log("\nเปรียบเทียบแบบรวม base SKU:");
  const all = new Set([...pdfGrouped.keys(), ...sysGrouped.keys()]);
  for (const sku of [...all].sort()) {
    const p = pdfGrouped.get(sku) || 0;
    const s = sysGrouped.get(sku) || 0;
    const mark = p === s ? "✅" : "❌";
    console.log(`${mark} ${sku}: PDF=${p} | ระบบ=${s}${p !== s ? ` (ต่าง ${s - p})` : ""}`);
  }
}

main();
