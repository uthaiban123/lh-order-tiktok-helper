require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

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

function normalizePdfSkuId(skuId, sellerSku, productName) {
  if (/^F08069002-2/.test(skuId)) return "F08069002-2";
  if (/^F08069002-6/.test(skuId)) return "F08069002-6";
  if (/^08103203-1/.test(skuId)) return "08103203-1";
  if (/^08103204-1/.test(skuId)) return "08103204-1";
  if (/^W08073305-10/.test(skuId)) return "W08073305-10";
  if (sellerSku === "F08069002") {
    if (/ยกแพ็ค\s*6|6\s*ขวด/i.test(productName)) return "F08069002-6";
    if (/แพ๊คคู่|เซ\s*็\s*ตคู่|2\s*ขวด/i.test(productName)) return "F08069002-2";
  }
  if (sellerSku) return sellerSku;
  return null;
}

function groupLines(lines, isPdf) {
  const map = new Map();
  for (const line of lines) {
    let sku;
    let qty;
    if (isPdf) {
      sku = normalizePdfSkuId(line.skuId, line.rawSellerSku, line.productName);
      qty = line.qty;
      if (!sku) {
        sku = "(unknown)";
      }
    } else {
      sku = line.sellerSku;
      qty = Number(line.qty || 0);
    }
    map.set(sku, (map.get(sku) || 0) + qty);
  }
  return map;
}

async function main() {
  const pdfRows = parseCsv(
    fs.readFileSync(path.join(FOLDER, "สรุปบิลการขาย_PDF_18-06-69_รายละเอียดสินค้า.csv"), "utf8")
  );

  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DATABASE_NAME });
  const IncomeEntry = mongoose.connection.collection("incomeentries");
  const OrderItem = mongoose.connection.collection("orderitems");

  const orderIds = [
    ...new Set(
      (await IncomeEntry.find({ settlementDate: DATE }, { projection: { orderId: 1 } }).toArray()).map(
        (x) => x.orderId
      )
    ),
  ].sort();

  const sysItems = await OrderItem.find({ orderId: { $in: orderIds } }).toArray();

  const pdfByOrder = new Map();
  for (const row of pdfRows) {
    const orderId = row["หมายเลขคำสั่งซื้อ"];
    if (!pdfByOrder.has(orderId)) pdfByOrder.set(orderId, []);
    pdfByOrder.get(orderId).push({
      qty: Number(row["จำนวน (ชิ้น)"] || 0),
      skuId: row["SKU ID"],
      rawSellerSku: row["Seller SKU"],
      productName: row["ชื่อสินค้า"],
    });
  }

  const sysByOrder = new Map();
  for (const it of sysItems) {
    if (!sysByOrder.has(it.orderId)) sysByOrder.set(it.orderId, []);
    sysByOrder.get(it.orderId).push(it);
  }

  console.log("=== ตรวจ duplicate ในระบบ ===\n");
  let dupOrders = 0;
  let extraQtyFromDup = 0;

  for (const orderId of orderIds) {
    const items = sysByOrder.get(orderId) || [];
    if (items.length <= 1) continue;

    const byKey = new Map();
    for (const it of items) {
      const key = `${it.sellerSku}|${it.qty}|${it.productName}|${it.itemSubtotalAfterDiscount || 0}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(it);
    }

    const dups = [...byKey.entries()].filter(([, rows]) => rows.length > 1);
    if (dups.length) {
      dupOrders += 1;
      console.log(`Order ${orderId}: ${items.length} rows (ซ้ำ ${items.length - new Set([...byKey.keys()]).size} แถว)`);
      for (const [key, rows] of dups) {
        const extra = rows.length - 1;
        extraQtyFromDup += extra * Number(rows[0].qty || 0);
        const batchIds = [...new Set(rows.map((r) => String(r.batchId)))].join(", ");
        console.log(`  ซ้ำ x${rows.length}: ${rows[0].sellerSku} qty=${rows[0].qty} (batchIds: ${batchIds})`);
      }
    }
  }

  console.log(`\nออเดอร์ที่มีแถวซ้ำ: ${dupOrders}`);
  console.log(`qty ส่วนเกินจาก duplicate โดยประมาณ: ${extraQtyFromDup}`);

  console.log("\n=== เทียบหลัง dedupe ระบบ (รวม qty ต่อ SKU ต่อ order) ===\n");

  const pdfTotals = new Map();
  const sysTotals = new Map();
  const sysDedupTotals = new Map();
  const mismatches = [];

  for (const orderId of orderIds) {
    const pdfLines = pdfByOrder.get(orderId) || [];
    const sysLines = sysByOrder.get(orderId) || [];

    const pdfGrouped = groupLines(
      pdfLines.map((p) => ({ ...p })),
      true
    );

    const sysGrouped = groupLines(sysLines, false);

    // dedupe: ใช้ unique combination sellerSku+qty+productName แล้วรวม qty
    const seen = new Set();
    const dedupLines = [];
    for (const it of sysLines) {
      const key = `${it.sellerSku}|${it.qty}|${it.productName}|${it.itemSubtotalAfterDiscount || 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedupLines.push(it);
    }
    const sysDedupGrouped = groupLines(dedupLines, false);

    for (const [sku, qty] of pdfGrouped) {
      pdfTotals.set(sku, (pdfTotals.get(sku) || 0) + qty);
    }
    for (const [sku, qty] of sysGrouped) {
      sysTotals.set(sku, (sysTotals.get(sku) || 0) + qty);
    }
    for (const [sku, qty] of sysDedupGrouped) {
      sysDedupTotals.set(sku, (sysDedupTotals.get(sku) || 0) + qty);
    }

    const pdfStr = [...pdfGrouped.entries()].map(([k, v]) => `${k}x${v}`).sort().join(" | ");
    const sysStr = [...sysDedupGrouped.entries()].map(([k, v]) => `${k}x${v}`).sort().join(" | ");

    if (pdfStr !== sysStr) {
      mismatches.push({ orderId, pdfGrouped, sysDedupGrouped, pdfStr, sysStr });
    }
  }

  const allSkus = new Set([...pdfTotals.keys(), ...sysDedupTotals.keys()]);
  console.log("SKU                  | PDF | ระบบ(raw) | ระบบ(dedup) | ตรง?");
  console.log("-".repeat(70));
  let matchAfterDedup = true;
  for (const sku of [...allSkus].sort()) {
    const p = pdfTotals.get(sku) || 0;
    const raw = sysTotals.get(sku) || 0;
    const d = sysDedupTotals.get(sku) || 0;
    const ok = p === d;
    if (!ok) matchAfterDedup = false;
    if (!ok || p > 0) {
      console.log(
        `${String(sku).padEnd(20)} | ${String(p).padStart(3)} | ${String(raw).padStart(9)} | ${String(d).padStart(11)} | ${ok ? "✅" : "❌"}`
      );
    }
  }

  console.log("\n=== ออเดอร์ที่ยังไม่ตรงหลัง dedupe ===");
  for (const m of mismatches) {
    console.log(`\nOrder ${m.orderId}`);
    console.log(`  PDF:   ${m.pdfStr || "(ว่าง)"}`);
    console.log(`  ระบบ: ${m.sysStr || "(ว่าง)"}`);
  }

  const pdfSum = [...pdfTotals.values()].reduce((a, b) => a + b, 0);
  const rawSum = [...sysTotals.values()].reduce((a, b) => a + b, 0);
  const dedupSum = [...sysDedupTotals.values()].reduce((a, b) => a + b, 0);

  console.log("\n=== สรุป ===");
  console.log(`PDF รวม tiktok qty: ${pdfSum}`);
  console.log(`ระบบ raw: ${rawSum} | หลัง dedupe: ${dedupSum} | ส่วนต่างจาก duplicate: ${rawSum - dedupSum}`);
  if (matchAfterDedup) {
    console.log("✅ หลังแก้ pack suffix + ตัด duplicate แล้ว จำนวนตรงกับ PDF ทุก SKU");
  } else {
    console.log("⚠️ ยังมี order/SKU ที่ไม่ตรงหลัง dedupe — ดูด้านบน");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
