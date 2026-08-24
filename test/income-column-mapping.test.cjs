const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { parseIncomeWorkbook } = require("../src/services/importService");

function buildIncomeWorkbook(headers, rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(workbook, sheet, "รายละเอียดคำสั่งซื้อ");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("maps current Thai income headers to revenue and settlement amounts", () => {
  const buffer = buildIncomeWorkbook(
    [
      "หมายเลขคำสั่งซื้อ/การปรับ",
      "ประเภทธุรกรรม",
      "เวลาที่ชำระคำสั่งซื้อ",
      "รายได้ทั้งหมด",
      "ยอดการชำระเงินทั้งหมด",
      "ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย",
      "ยอดรวมเงินคืนหลังหักส่วนลดจากผู้ขาย",
    ],
    [["585620617854552010", "คำสั่งซื้อ", "2026/08/23", "85", "62.54", "85", "0"]]
  );

  const entries = parseIncomeWorkbook(buffer);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].orderId, "585620617854552010");
  assert.equal(entries[0].settlementDate, "2026-08-23");
  assert.equal(entries[0].entryType, "Order");
  assert.equal(entries[0].totalRevenue, 85);
  assert.equal(entries[0].totalSettlementAmount, 62.54);
  assert.equal(entries[0].subtotalAfterSellerDiscounts, 85);
  assert.equal(entries[0].refundSubtotal, 0);
});

test("still maps older Thai and English income headers", () => {
  const buffer = buildIncomeWorkbook(
    [
      "Order ID",
      "Type",
      "Settlement Date",
      "Total Revenue",
      "Total Settlement Amount",
      "Subtotal after seller discounts",
      "Refund subtotal after seller discounts",
    ],
    [["584480395987224408", "Order", "2026-08-18", "120", "88.5", "120", "0"]]
  );

  const entries = parseIncomeWorkbook(buffer);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].settlementDate, "2026-08-18");
  assert.equal(entries[0].totalRevenue, 120);
  assert.equal(entries[0].totalSettlementAmount, 88.5);
});
