import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const DATE = "2026-06-18";
const FOLDER = "18-06-69";

function extractPdfOrderIds(folder) {
  return fs
    .readdirSync(folder)
    .filter((f) => f.endsWith(".pdf"))
    .map((f) => f.match(/order_no=(\d+)/)?.[1])
    .filter(Boolean)
    .sort();
}

function findXlsxFile(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const found = findXlsxFile(p);
      if (found) return found;
    } else if (/\.xlsx?$/i.test(ent.name)) {
      return p;
    }
  }
  return null;
}

function parseIncomeFromExtract(folder) {
  const xlsxFile = findXlsxFile(path.join(folder, "xlsx_extract"));
  if (!xlsxFile) {
    throw new Error("No xlsx found in xlsx_extract");
  }

  const wb = XLSX.readFile(xlsxFile);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const orderIdKey =
    Object.keys(rows[0] || {}).find((k) =>
      /order.?id|หมายเลขคำสั่ง/i.test(k)
    ) || Object.keys(rows[0] || {})[0];

  const typeKey =
    Object.keys(rows[0] || {}).find((k) =>
      /type|ประเภท|entry/i.test(k)
    ) || null;

  const qtyKey =
    Object.keys(rows[0] || {}).find((k) =>
      /quantity|qty|จำนวน/i.test(k)
    ) || null;

  const skuKey =
    Object.keys(rows[0] || {}).find((k) =>
      /seller.?sku|sku/i.test(k)
    ) || null;

  const orders = rows
    .map((row) => ({
      orderId: String(row[orderIdKey] || "").trim(),
      entryType: typeKey ? String(row[typeKey] || "").trim() : "",
      qty: qtyKey ? Number(row[qtyKey] || 0) : null,
      sellerSku: skuKey ? String(row[skuKey] || "").trim() : "",
      raw: row,
    }))
    .filter((r) => r.orderId && /^\d+$/.test(r.orderId));

  return { rows, orders, orderIdKey, typeKey, qtyKey, skuKey, sheetName: wb.SheetNames[0] };
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
    { projection: { orderId: 1, sellerSku: 1, qty: 1, productName: 1 } }
  ).toArray();

  const skuSummary = await OrderItem.aggregate([
    { $match: { orderId: { $in: orderIds } } },
    {
      $group: {
        _id: "$sellerSku",
        soldUnits: { $sum: "$qty" },
        ordersCount: { $addToSet: "$orderId" },
      },
    },
    {
      $project: {
        sellerSku: "$_id",
        soldUnits: 1,
        ordersCount: { $size: "$ordersCount" },
      },
    },
    { $sort: { soldUnits: -1 } },
  ]).toArray();

  const totalSoldUnits = orderItems.reduce((s, i) => s + Number(i.qty || 0), 0);

  await mongoose.disconnect();

  return {
    incomeEntryCount: incomeEntries.length,
    settledOrders: orderIds.length,
    orderItemRows: orderItems.length,
    totalSoldUnits,
    orderIds: orderIds.sort(),
    orderItems,
    skuSummary,
    incomeEntries,
  };
}

async function main() {
  const pdfOrderIds = extractPdfOrderIds(FOLDER);
  const income = parseIncomeFromExtract(FOLDER);
  const incomeOrderIds = [...new Set(income.orders.map((o) => o.orderId))].sort();

  console.log("=== ข้อมูลจากโฟลเดอร์ 18-06-69 ===");
  console.log("PDF บิลรับเงิน:", pdfOrderIds.length, "ไฟล์");
  console.log("Income xlsx แถว:", income.rows.length);
  console.log("Income unique order IDs:", incomeOrderIds.length);
  console.log("คอลัมน์ order ID:", income.orderIdKey);

  let system;
  try {
    system = await getSystemSummary();
  } catch (err) {
    console.error("\nไม่สามารถเชื่อมต่อ MongoDB:", err.message);
    process.exit(1);
  }

  console.log("\n=== รายงานระบบ วันที่", DATE, "(18 มิ.ย. 2569) ===");
  console.log("Income entries:", system.incomeEntryCount);
  console.log("Settled orders:", system.settledOrders);
  console.log("Order item rows:", system.orderItemRows);
  console.log("Total sold units (qty):", system.totalSoldUnits);

  const pdfSet = new Set(pdfOrderIds);
  const incomeSet = new Set(incomeOrderIds);
  const systemSet = new Set(system.orderIds);

  const pdfNotInSystem = pdfOrderIds.filter((id) => !systemSet.has(id));
  const systemNotInPdf = system.orderIds.filter((id) => !pdfSet.has(id));
  const pdfNotInIncome = pdfOrderIds.filter((id) => !incomeSet.has(id));
  const incomeNotInPdf = incomeOrderIds.filter((id) => !pdfSet.has(id));
  const systemNotInIncome = system.orderIds.filter((id) => !incomeSet.has(id));

  console.log("\n=== เปรียบเทียบ Order ID ===");
  console.log("PDF vs ระบบ - ตรงกัน:", pdfOrderIds.filter((id) => systemSet.has(id)).length);
  console.log("PDF มีแต่ระบบไม่มี:", pdfNotInSystem.length, pdfNotInSystem);
  console.log("ระบบมีแต่ PDF ไม่มี:", systemNotInPdf.length, systemNotInPdf);
  console.log("PDF vs Income xlsx - ตรงกัน:", pdfOrderIds.filter((id) => incomeSet.has(id)).length);
  console.log("PDF มีแต่ Income ไม่มี:", pdfNotInIncome.length, pdfNotInIncome);
  console.log("Income มีแต่ PDF ไม่มี:", incomeNotInPdf.length, incomeNotInPdf);
  console.log("ระบบ vs Income xlsx - ตรงกัน:", system.orderIds.filter((id) => incomeSet.has(id)).length);
  console.log("ระบบมีแต่ Income ไม่มี:", systemNotInIncome.length, systemNotInIncome);

  console.log("\n=== สรุป SKU ในระบบ ===");
  for (const row of system.skuSummary) {
    console.log(`${row.sellerSku || "(empty)"}: ${row.soldUnits} ชิ้น, ${row.ordersCount} orders`);
  }

  const allMatch =
    pdfOrderIds.length === system.settledOrders &&
    pdfNotInSystem.length === 0 &&
    systemNotInPdf.length === 0;

  console.log("\n=== สรุปผล ===");
  if (allMatch) {
    console.log("✅ จำนวน order ตรงกัน: PDF", pdfOrderIds.length, "= ระบบ", system.settledOrders);
  } else {
    console.log("❌ จำนวน order ไม่ตรงกัน: PDF", pdfOrderIds.length, "vs ระบบ", system.settledOrders);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
