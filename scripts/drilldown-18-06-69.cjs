require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { parseSellerSku } = require("../src/utils/sku");

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

function inferPdfVariant(row) {
  const skuId = row["SKU ID"] || "";
  const sellerSku = row["Seller SKU"] || "";
  const name = row["ชื่อสินค้า"] || "";

  // SKU ID เช่น F08069002-21733364760987338301 หรือ 08103203-11733385643956667965
  const idMatch = skuId.match(/^([A-Za-z0-9]+)-(\d+)/);
  if (idMatch) {
    const parsed = parseSellerSku(`${idMatch[1]}-${idMatch[2]}`);
    if (parsed.packMultiplier > 1) {
      return {
        sellerSku: parsed.sellerSku,
        baseProductCode: parsed.baseProductCode,
        packMultiplier: parsed.packMultiplier,
        source: "sku-id",
      };
    }
  }

  if (sellerSku) {
    const parsed = parseSellerSku(sellerSku);
    return {
      sellerSku: parsed.sellerSku,
      baseProductCode: parsed.baseProductCode,
      packMultiplier: parsed.packMultiplier,
      source: "seller-sku",
    };
  }

  if (/ยกแพ็ค\s*6|6\s*ขวด/i.test(name)) {
    return { sellerSku: "F08069002-6", baseProductCode: "F08069002", packMultiplier: 6, source: "name" };
  }
  if (/แพ๊คคู่|เซ\s*็\s*ตคู่|2\s*ขวด/i.test(name)) {
    return { sellerSku: "F08069002-2", baseProductCode: "F08069002", packMultiplier: 2, source: "name" };
  }
  if (/แพค10|10\s*ถุง/i.test(name)) {
    return { sellerSku: "W08073305-10", baseProductCode: "W08073305", packMultiplier: 10, source: "name" };
  }
  if (/08103203/i.test(skuId)) {
    return { sellerSku: "08103203-1", baseProductCode: "08103203", packMultiplier: 1, source: "sku-id-prefix" };
  }
  if (/08103204/i.test(skuId)) {
    return { sellerSku: "08103204-1", baseProductCode: "08103204", packMultiplier: 1, source: "sku-id-prefix" };
  }

  return {
    sellerSku: sellerSku || "(unknown)",
    baseProductCode: sellerSku || "(unknown)",
    packMultiplier: 1,
    source: "unknown",
  };
}

async function main() {
  const pdfItems = parseCsv(
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
  ];

  const sysItems = await OrderItem.find(
    { orderId: { $in: orderIds } },
    {
      projection: {
        orderId: 1,
        sellerSku: 1,
        qty: 1,
        baseProductCode: 1,
        packMultiplier: 1,
        productName: 1,
        lineNo: 1,
      },
    }
  ).toArray();

  const sysByOrder = new Map();
  for (const it of sysItems) {
    if (!sysByOrder.has(it.orderId)) sysByOrder.set(it.orderId, []);
    sysByOrder.get(it.orderId).push(it);
  }

  const pdfByOrder = new Map();
  for (const row of pdfItems) {
    const orderId = row["หมายเลขคำสั่งซื้อ"];
    const variant = inferPdfVariant(row);
    const qty = Number(row["จำนวน (ชิ้น)"] || 0);
    if (!pdfByOrder.has(orderId)) pdfByOrder.set(orderId, []);
    pdfByOrder.get(orderId).push({
      lineNo: Number(row["ลำดับรายการ"] || 0),
      qty,
      variant,
      productName: row["ชื่อสินค้า"],
      skuId: row["SKU ID"],
      rawSellerSku: row["Seller SKU"],
    });
  }

  const diffs = [];
  const pdfResolved = new Map();
  const sysResolved = new Map();

  function add(map, sku, tiktokQty, baseQty) {
    if (!map.has(sku)) map.set(sku, { tiktokQty: 0, baseQty: 0 });
    const row = map.get(sku);
    row.tiktokQty += tiktokQty;
    row.baseQty += baseQty;
  }

  for (const orderId of orderIds.sort()) {
    const pdfLines = pdfByOrder.get(orderId) || [];
    const sysLines = sysByOrder.get(orderId) || [];

    for (const p of pdfLines) {
      add(pdfResolved, p.variant.sellerSku, p.qty, p.qty * p.variant.packMultiplier);
    }
    for (const s of sysLines) {
      const sku = s.sellerSku || "(empty)";
      const mult = Number(s.packMultiplier || 1);
      add(sysResolved, sku, Number(s.qty || 0), Number(s.qty || 0) * mult);
    }

    const pdfKey = pdfLines
      .map((p) => `${p.variant.sellerSku}x${p.qty}`)
      .sort()
      .join(" | ");
    const sysKey = sysLines
      .map((s) => `${s.sellerSku || "?"}x${s.qty}`)
      .sort()
      .join(" | ");

    if (pdfKey !== sysKey) {
      diffs.push({ orderId, pdfLines, sysLines, pdfKey, sysKey });
    }
  }

  console.log("=== สรุปหลัง infer variant จาก PDF (SKU ID / ชื่อสินค้า) ===\n");

  const allSkus = new Set([...pdfResolved.keys(), ...sysResolved.keys()]);
  let tiktokMatch = true;
  let baseMatch = true;

  for (const sku of [...allSkus].sort()) {
    const p = pdfResolved.get(sku) || { tiktokQty: 0, baseQty: 0 };
    const s = sysResolved.get(sku) || { tiktokQty: 0, baseQty: 0 };
    const tiktokOk = p.tiktokQty === s.tiktokQty;
    const baseOk = p.baseQty === s.baseQty;
    if (!tiktokOk) tiktokMatch = false;
    if (!baseOk) baseMatch = false;

    if (!tiktokOk || !baseOk) {
      console.log(
        `${sku}: PDF tiktok=${p.tiktokQty} base=${p.baseQty} | ระบบ tiktok=${s.tiktokQty} base=${s.baseQty}`
      );
    } else {
      console.log(`${sku}: tiktok=${p.tiktokQty} base=${p.baseQty} ✅`);
    }
  }

  const pdfTiktokTotal = [...pdfResolved.values()].reduce((a, r) => a + r.tiktokQty, 0);
  const sysTiktokTotal = [...sysResolved.values()].reduce((a, r) => a + r.tiktokQty, 0);
  const pdfBaseTotal = [...pdfResolved.values()].reduce((a, r) => a + r.baseQty, 0);
  const sysBaseTotal = [...sysResolved.values()].reduce((a, r) => a + r.baseQty, 0);

  console.log("\n=== รวม ===");
  console.log(`PDF tiktok qty: ${pdfTiktokTotal} | ระบบ: ${sysTiktokTotal}`);
  console.log(`PDF base units: ${pdfBaseTotal} | ระบบ: ${sysBaseTotal}`);

  console.log(`\n=== ออเดอร์ที่ยังไม่ตรง (${diffs.length} รายการ) ===\n`);
  for (const d of diffs) {
    console.log(`Order ${d.orderId}`);
    console.log(`  PDF: ${d.pdfKey || "(ไม่มีรายการ)"}`);
    console.log(`  SYS: ${d.sysKey || "(ไม่มีรายการ)"}`);

    if (d.pdfLines.some((p) => p.variant.source === "unknown")) {
      const unknown = d.pdfLines.filter((p) => p.variant.source === "unknown");
      console.log(`  ⚠️ PDF อ่าน variant ไม่ได้ ${unknown.length} บรรทัด`);
      for (const u of unknown) {
        console.log(`     line ${u.lineNo}: ${u.productName || "(ไม่มีชื่อ)"} qty=${u.qty} skuId=${u.skuId || "-"}`);
      }
    }

    console.log("  รายละเอียด:");
    for (const p of d.pdfLines) {
      console.log(
        `    PDF L${p.lineNo}: ${p.variant.sellerSku} x${p.qty} (pack x${p.variant.packMultiplier}, src=${p.variant.source})`
      );
    }
    for (const s of d.sysLines) {
      console.log(
        `    SYS L${s.lineNo}: ${s.sellerSku} x${s.qty} (pack x${s.packMultiplier}) ${String(s.productName || "").slice(0, 40)}`
      );
    }
    console.log("");
  }

  await mongoose.disconnect();

  console.log("=== สรุป ===");
  if (tiktokMatch) {
    console.log("✅ จำนวน TikTok qty ตรงกันทุก seller SKU หลัง infer -2/-6 จาก PDF");
  } else if (baseMatch) {
    console.log("✅ จำนวน base units ตรงกัน (ต่างแค่การนับ tiktok pack)");
  } else {
    console.log("❌ ยังมีความต่างหลัง infer variant — ดูรายการ order ด้านบน");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
