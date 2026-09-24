const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSign } = require("../src/services/tiktokShopClient");
const {
  computeSyncWindow,
  mapTikTokOrder,
} = require("../src/services/orderSyncService");

const START = 1_758_643_200;

test("first sync of the day uses the create time of today", () => {
  const window = computeSyncWindow({
    nowUnix: START + 14 * 60 * 60,
    startOfTodayUnix: START,
    cursorUnix: 0,
  });

  assert.equal(window.mode, "create_time");
  assert.equal(window.filters.create_time_ge, START);
  assert.equal(window.filters.update_time_ge, undefined);
});

test("later syncs look back three hours and stay inside today", () => {
  const nowUnix = START + 16 * 60 * 60;
  const window = computeSyncWindow({
    nowUnix,
    startOfTodayUnix: START,
    cursorUnix: START + 15 * 60 * 60,
  });

  assert.equal(window.mode, "update_time");
  assert.equal(window.filters.create_time_ge, START);
  assert.equal(window.filters.update_time_ge, START + 12 * 60 * 60);
  assert.equal(window.filters.update_time_lt, nowUnix);
});

test("maps a TikTok order into one header and grouped items", () => {
  const mapped = mapTikTokOrder(
    {
      id: "576932018345678901",
      status: "AWAITING_SHIPMENT",
      create_time: START + 3600,
      paid_time: START + 3700,
      payment: { total_amount: "160.50" },
      line_items: [
        {
          seller_sku: "SKU-A-2",
          product_name: "สินค้า A",
          sku_name: "แดง",
          sale_price: "80.25",
        },
        {
          seller_sku: "SKU-A-2",
          product_name: "สินค้า A",
          sku_name: "แดง",
          sale_price: "80.25",
        },
      ],
    },
    START
  );

  assert.equal(mapped.orderId, "576932018345678901");
  assert.equal(mapped.header.orderStatus, "AWAITING_SHIPMENT");
  assert.equal(mapped.header.orderAmount, 160.5);
  assert.equal(mapped.items.length, 1);
  assert.equal(mapped.items[0].qty, 2);
  assert.equal(mapped.items[0].sellerSku, "SKU-A-2");
  assert.equal(mapped.items[0].baseProductCode, "SKU-A");
  assert.equal(mapped.items[0].packMultiplier, 2);
  assert.equal(mapped.items[0].itemSubtotalAfterDiscount, 160.5);
});

test("ignores orders created before today", () => {
  const mapped = mapTikTokOrder(
    {
      id: "1",
      status: "DELIVERED",
      create_time: START - 60,
      line_items: [],
    },
    START
  );

  assert.equal(mapped, null);
});

test("signs requests with the app secret wrapped around the canonical string", () => {
  const sign = buildSign({
    path: "/order/202309/orders/search",
    params: { app_key: "key", timestamp: "10", page_size: "20" },
    body: '{"create_time_ge":1}',
    appSecret: "secret",
  });

  assert.equal(sign.length, 64);
  assert.notEqual(
    sign,
    buildSign({
      path: "/order/202309/orders/search",
      params: { app_key: "key", timestamp: "11", page_size: "20" },
      body: '{"create_time_ge":1}',
      appSecret: "secret",
    })
  );
});
