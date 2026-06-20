require("dotenv").config();
const mongoose = require("mongoose");
const { buildOrderItemLogicalKey } = require("../src/services/importService");

const dryRun = process.argv.includes("--dry-run");

function pickKeeper(rows) {
  return rows.sort((left, right) => {
    const leftTime = new Date(left.createdAt || 0).getTime();
    const rightTime = new Date(right.createdAt || 0).getTime();
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return String(left._id).localeCompare(String(right._id));
  })[0];
}

async function auditDuplicates(OrderItem, OrderHeader, IncomeEntry, Batch) {
  const items = await OrderItem.find(
    {},
    {
      projection: {
        orderId: 1,
        sellerSku: 1,
        qty: 1,
        productName: 1,
        itemSubtotalAfterDiscount: 1,
        batchId: 1,
        createdAt: 1,
      },
    }
  ).toArray();

  const groupedItems = new Map();
  for (const item of items) {
    const key = buildOrderItemLogicalKey(item);
    if (!groupedItems.has(key)) groupedItems.set(key, []);
    groupedItems.get(key).push(item);
  }

  const duplicateItemGroups = [...groupedItems.entries()].filter(([, rows]) => rows.length > 1);
  const duplicateItemIds = [];
  let extraQty = 0;

  for (const [, rows] of duplicateItemGroups) {
    const keeper = pickKeeper(rows);
    for (const row of rows) {
      if (String(row._id) === String(keeper._id)) continue;
      duplicateItemIds.push(row._id);
      extraQty += Number(row.qty || 0);
    }
  }

  const headers = await OrderHeader.find(
    {},
    { projection: { orderId: 1, batchId: 1, createdAt: 1 } }
  ).toArray();
  const groupedHeaders = new Map();
  for (const header of headers) {
    if (!groupedHeaders.has(header.orderId)) groupedHeaders.set(header.orderId, []);
    groupedHeaders.get(header.orderId).push(header);
  }

  const duplicateHeaderGroups = [...groupedHeaders.entries()].filter(([, rows]) => rows.length > 1);
  const duplicateHeaderIds = [];
  for (const [, rows] of duplicateHeaderGroups) {
    const keeper = pickKeeper(rows);
    for (const row of rows) {
      if (String(row._id) === String(keeper._id)) continue;
      duplicateHeaderIds.push(row._id);
    }
  }

  const affectedOrderIds = [
    ...new Set(
      duplicateItemGroups.flatMap(([, rows]) => rows.map((row) => row.orderId))
    ),
  ];

  const incomeDates = await IncomeEntry.aggregate([
    { $match: { orderId: { $in: affectedOrderIds } } },
    {
      $group: {
        _id: "$settlementDate",
        orders: { $addToSet: "$orderId" },
        entries: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const orderBatches = await Batch.find({ batchType: "orders" }).sort({ createdAt: 1 }).toArray();
  const overlappingBatches = [];
  for (let i = 0; i < orderBatches.length; i += 1) {
    for (let j = i + 1; j < orderBatches.length; j += 1) {
      const leftItems = items.filter((item) => String(item.batchId) === String(orderBatches[i]._id));
      const rightItems = items.filter((item) => String(item.batchId) === String(orderBatches[j]._id));
      const leftOrderIds = new Set(leftItems.map((item) => item.orderId));
      const overlap = [...new Set(rightItems.map((item) => item.orderId))].filter((orderId) =>
        leftOrderIds.has(orderId)
      );
      if (overlap.length > 0) {
        overlappingBatches.push({
          earlierBatch: orderBatches[i],
          laterBatch: orderBatches[j],
          overlapCount: overlap.length,
        });
      }
    }
  }

  return {
    duplicateItemGroups: duplicateItemGroups.length,
    duplicateItemIds,
    extraQty,
    duplicateHeaderGroups: duplicateHeaderGroups.length,
    duplicateHeaderIds,
    incomeDates,
    overlappingBatches,
    orderBatchCount: orderBatches.length,
    firstOrderBatchAt: orderBatches[0]?.createdAt || null,
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DATABASE_NAME });

  const OrderItem = mongoose.connection.collection("orderitems");
  const OrderHeader = mongoose.connection.collection("orderheaders");
  const IncomeEntry = mongoose.connection.collection("incomeentries");
  const Batch = mongoose.connection.collection("batches");

  const audit = await auditDuplicates(OrderItem, OrderHeader, IncomeEntry, Batch);

  console.log(dryRun ? "=== DRY RUN ===" : "=== CLEANUP DUPLICATE ORDERS ===");
  console.log(`Order batches ทั้งหมด: ${audit.orderBatchCount}`);
  console.log(`Batch orders แรกสุด: ${audit.firstOrderBatchAt || "-"}`);
  console.log(`กลุ่ม order item ซ้ำ: ${audit.duplicateItemGroups}`);
  console.log(`แถว order item ที่จะลบ: ${audit.duplicateItemIds.length}`);
  console.log(`qty ส่วนเกินที่จะลบ: ${audit.extraQty}`);
  console.log(`กลุ่ม order header ซ้ำ: ${audit.duplicateHeaderGroups}`);
  console.log(`แถว order header ที่จะลบ: ${audit.duplicateHeaderIds.length}`);

  if (audit.overlappingBatches.length) {
    console.log("\n=== Batch orders ที่มี order ทับซ้อน ===");
    for (const pair of audit.overlappingBatches) {
      console.log(
        `- ${pair.earlierBatch.filename} (${pair.earlierBatch.createdAt}) ↔ ${pair.laterBatch.filename} (${pair.laterBatch.createdAt}) overlap ${pair.overlapCount} orders`
      );
    }
  }

  if (audit.incomeDates.length) {
    console.log("\n=== วัน settlement ที่ได้รับผลจาก duplicate ===");
    for (const row of audit.incomeDates) {
      console.log(`- ${row._id}: ${row.orders.length} orders (${row.entries} income entries)`);
    }
  }

  if (!dryRun && audit.duplicateItemIds.length + audit.duplicateHeaderIds.length > 0) {
    const itemResult = audit.duplicateItemIds.length
      ? await OrderItem.deleteMany({ _id: { $in: audit.duplicateItemIds } })
      : { deletedCount: 0 };
    const headerResult = audit.duplicateHeaderIds.length
      ? await OrderHeader.deleteMany({ _id: { $in: audit.duplicateHeaderIds } })
      : { deletedCount: 0 };

    console.log("\n=== ลบแล้ว ===");
    console.log(`order items deleted: ${itemResult.deletedCount || 0}`);
    console.log(`order headers deleted: ${headerResult.deletedCount || 0}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
