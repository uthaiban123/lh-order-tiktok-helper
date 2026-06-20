const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();

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

function extractPdfOrderIds(folder) {
  return fs
    .readdirSync(folder)
    .filter((f) => f.endsWith(".pdf"))
    .map((f) => f.match(/order_no=(\d+)/)?.[1])
    .filter(Boolean)
    .sort();
}

function loadPdfSummaries(folder) {
  const ordersCsv = parseCsv(
    fs.readFileSync(path.join(folder, "สรุปบิลการขาย_PDF_18-06-69_รายการออเดอร์.csv"), "utf8")
  );
  const itemsCsv = parseCsv(
    fs.readFileSync(path.join(folder, "สรุปบิลการขาย_PDF_18-06-69_รายละเอียดสินค้า.csv"), "utf8")
  );
  const skuCsv = parseCsv(
    fs.readFileSync(path.join(folder, "สรุปยอดขายตาม_Seller_SKU_18-06-69.csv"), "utf8")
  );

  const skuSummary = skuCsv.map((row) => ({
    sellerSku: row["Seller SKU"] || "",
    productName: row["ชื่อสินค้า"] || "",
    soldUnits: Number(row["จำนวนที่ขาย (ชิ้น)"] || 0),
    totalAmount: Number(row["ยอดเงินรวม (บาท)"] || 0),
  }));

  const totalSoldUnits = skuSummary.reduce((s, r) => s + r.soldUnits, 0);
  const totalItemRows = itemsCsv.length;
  const totalItemQty = itemsCsv.reduce((s, r) => s + Number(r["จำนวน (ชิ้น)"] || 0), 0);

  return {
    orders: ordersCsv,
    orderIds: ordersCsv.map((r) => r["หมายเลขคำสั่งซื้อ"]).sort(),
    items: itemsCsv,
    skuSummary,
    totalSoldUnits,
    totalItemRows,
    totalItemQty,
  };
}

async function getSystemSummary() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
  const dbName = process.env.DATABASE_NAME || "lh_order_tiktok_helper";

  await mongoose.connect(mongoUri, { dbName });

  const IncomeEntry = mongoose.connection.collection("incomeentries");
  const OrderItem = mongoose.connection.collection("orderitems");

  const incomeEntries = await IncomeEntry.find(
    { settlementDate: DATE },
    { projection: { orderId: 1, entryType: 1, totalRevenue: 1, totalSettlementAmount: 1 } }
  ).toArray();

  const orderIds = [...new Set(incomeEntries.map((e) => e.orderId))];

  const orderItems = await OrderItem.find(
    { orderId: { $in: orderIds } },
    {
      projection: {
        orderId: 1,
        sellerSku: 1,
        qty: 1,
        productName: 1,
        baseProductCode: 1,
        packMultiplier: 1,
      },
    }
  ).toArray();

  const skuSummary = await OrderItem.aggregate([
    { $match: { orderId: { $in: orderIds } } },
    {
      $group: {
        _id: "$sellerSku",
        soldUnits: { $sum: "$qty" },
        ordersCount: { $addToSet: "$orderId" },
        productName: { $first: "$productName" },
        baseProductCode: { $first: "$baseProductCode" },
        packMultiplier: { $first: "$packMultiplier" },
      },
    },
    {
      $project: {
        sellerSku: "$_id",
        soldUnits: 1,
        ordersCount: { $size: "$ordersCount" },
        productName: 1,
        baseProductCode: 1,
        packMultiplier: 1,
        equivalentBaseUnits: {
          $multiply: ["$soldUnits", { $ifNull: ["$packMultiplier", 1] }],
        },
      },
    },
    { $sort: { soldUnits: -1 } },
  ]).toArray();

  const totalSoldUnits = orderItems.reduce((s, i) => s + Number(i.qty || 0), 0);
  const totalEquivalentBaseUnits = skuSummary.reduce(
    (s, row) => s + Number(row.equivalentBaseUnits || 0),
    0
  );

  const matchedOrderIds = [...new Set(orderItems.map((i) => i.orderId))];

  await mongoose.disconnect();

  return {
    incomeEntryCount: incomeEntries.length,
    settledOrders: orderIds.length,
    matchedOrders: matchedOrderIds.length,
    orderItemRows: orderItems.length,
    totalSoldUnits,
    totalEquivalentBaseUnits,
    orderIds: orderIds.sort(),
    orderItems,
    skuSummary,
  };
}

function compareSku(pdfSku, systemSku) {
  const pdfMap = new Map(pdfSku.map((r) => [r.sellerSku || "(empty)", r.soldUnits]));
  const sysMap = new Map(systemSku.map((r) => [r.sellerSku || "(empty)", r.soldUnits]));
  const allSkus = [...new Set([...pdfMap.keys(), ...sysMap.keys()])].sort();

  const diffs = [];
  for (const sku of allSkus) {
    const pdfQty = pdfMap.get(sku) || 0;
    const sysQty = sysMap.get(sku) || 0;
    if (pdfQty !== sysQty) {
      diffs.push({ sku, pdfQty, sysQty, delta: sysQty - pdfQty });
    }
  }
  return diffs;
}

async function main() {
  const pdfOrderIds = extractPdfOrderIds(FOLDER);
  const pdf = loadPdfSummaries(FOLDER);
  const system = await getSystemSummary();

  console.log("=== ข้อมูลจาก PDF บิล (โฟลเดอร์ 18-06-69) ===");
  console.log("ไฟล์ PDF:", pdfOrderIds.length);
  console.log("ออเดอร์ใน CSV:", pdf.orderIds.length);
  console.log("รายการสินค้า (แถว):", pdf.totalItemRows, "| รวม qty:", pdf.totalItemQty);
  console.log("สรุป SKU (รวมชิ้น):", pdf.totalSoldUnits);

  console.log("\n=== รายงานระบบ วันที่", DATE, "(18 มิ.ย. 2569) ===");
  console.log("Income entries:", system.incomeEntryCount);
  console.log("Settled orders:", system.settledOrders);
  console.log("Matched orders:", system.matchedOrders);
  console.log("Order item rows:", system.orderItemRows);
  console.log("Total sold units:", system.totalSoldUnits);
  console.log("Equivalent base units:", system.totalEquivalentBaseUnits);

  const pdfSet = new Set(pdf.orderIds);
  const systemSet = new Set(system.orderIds);

  const pdfNotInSystem = pdf.orderIds.filter((id) => !systemSet.has(id));
  const systemNotInPdf = system.orderIds.filter((id) => !pdfSet.has(id));

  console.log("\n=== เปรียบเทียบ Order ===");
  console.log("PDF ตรงระบบ:", pdf.orderIds.filter((id) => systemSet.has(id)).length, "/", pdf.orderIds.length);
  if (pdfNotInSystem.length) console.log("PDF มีแต่ระบบไม่มี:", pdfNotInSystem.join(", "));
  if (systemNotInPdf.length) console.log("ระบบมีแต่ PDF ไม่มี:", systemNotInPdf.join(", "));

  console.log("\n=== PDF SKU summary ===");
  for (const row of pdf.skuSummary) {
    console.log(`${row.sellerSku}: ${row.soldUnits} ชิ้น`);
  }

  console.log("\n=== ระบบ SKU summary ===");
  for (const row of system.skuSummary) {
    console.log(
      `${row.sellerSku || "(empty)"}: ${row.soldUnits} ชิ้น` +
        (row.packMultiplier > 1 ? ` (x${row.packMultiplier} = ${row.equivalentBaseUnits} base)` : "")
    );
  }

  const skuDiffs = compareSku(pdf.skuSummary, system.skuSummary);
  console.log("\n=== เปรียบเทียบจำนวนขายตาม SKU ===");
  if (skuDiffs.length === 0) {
    console.log("✅ ทุก SKU ตรงกัน");
  } else {
    console.log("❌ SKU ที่ไม่ตรง:");
    for (const d of skuDiffs) {
      console.log(`  ${d.sku}: PDF=${d.pdfQty} | ระบบ=${d.sysQty} | ต่าง=${d.delta}`);
    }
  }

  const missingItems = system.orderIds.filter(
    (id) => !system.orderItems.some((item) => item.orderId === id)
  );
  if (missingItems.length) {
    console.log("\n⚠️ Orders settle แล้วแต่ไม่มีรายการสินค้า:", missingItems.join(", "));
  }

  const ordersMatch =
    pdf.orderIds.length === system.settledOrders &&
    pdfNotInSystem.length === 0 &&
    systemNotInPdf.length === 0;
  const qtyMatch = pdf.totalSoldUnits === system.totalSoldUnits && skuDiffs.length === 0;

  console.log("\n=== สรุปผล ===");
  if (ordersMatch && qtyMatch && missingItems.length === 0) {
    console.log("✅ จำนวนการขายถูกต้อง — 30 orders และยอด SKU ตรงกับระบบครบ");
  } else if (ordersMatch && !qtyMatch) {
    console.log("⚠️ จำนวน order ตรงกัน แต่ยอดขายตาม SKU ไม่ตรง");
  } else if (!ordersMatch) {
    console.log("❌ จำนวน order ไม่ตรง — PDF:", pdf.orderIds.length, "| ระบบ:", system.settledOrders);
  } else {
    console.log("⚠️ มีประเด็นที่ต้องตรวจเพิ่ม (ดูรายละเอียดด้านบน)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
