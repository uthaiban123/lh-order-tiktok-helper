const Batch = require("../models/Batch");
const OrderHeader = require("../models/OrderHeader");
const OrderItem = require("../models/OrderItem");
const SyncState = require("../models/SyncState");
const env = require("../config/env");
const { parseSellerSku } = require("../utils/sku");
const { refreshAccessToken, searchOrdersPage } = require("./tiktokShopClient");

const API_BATCH_HASH = "tiktok-api-order-sync";
const AUTH_STATE_KEY = "tiktok_auth";
const SYNC_STATE_KEY = "order_sync";
const BACKFILL_STATE_KEY = "order_backfill";
const BACKFILL_VERSION = 1;
const OVERLAP_SECONDS = 3 * 60 * 60;
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const TOKEN_REFRESH_MARGIN_SECONDS = 60 * 60;

let currentRun = null;

function getBangkokParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function getBangkokStartOfTodayUnix(now = new Date()) {
  const { year, month, day } = getBangkokParts(now);
  return Math.floor(Date.parse(`${year}-${month}-${day}T00:00:00+07:00`) / 1000);
}

function formatBangkokDateTime(unixSeconds) {
  if (!unixSeconds) {
    return "";
  }
  const { year, month, day, hour, minute, second } = getBangkokParts(
    new Date(Number(unixSeconds) * 1000)
  );
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatBangkokDate(now = new Date()) {
  const { year, month, day } = getBangkokParts(now);
  return `${year}-${month}-${day}`;
}

function getSyncFloorUnix() {
  return Math.floor(Date.parse(`${env.orderSyncStartDate}T00:00:00+07:00`) / 1000);
}

function computeSyncWindow({ nowUnix, floorUnix, startOfTodayUnix, cursorUnix }) {
  const cursor = Number(cursorUnix || 0);
  if (!cursor) {
    return {
      mode: "create_time",
      sortField: "create_time",
      filters: {
        create_time_ge: Math.max(floorUnix, startOfTodayUnix),
        create_time_lt: nowUnix,
      },
    };
  }

  return {
    mode: "update_time",
    sortField: "update_time",
    filters: {
      create_time_ge: floorUnix,
      update_time_ge: Math.max(floorUnix, cursor - OVERLAP_SECONDS),
      update_time_lt: nowUnix,
    },
  };
}

function toMoney(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function mapTikTokOrder(order, floorUnix) {
  const createTime = Number(order.create_time || 0);
  const orderId = String(order.id || order.order_id || "").trim();
  if (!orderId || !createTime || createTime < floorUnix) {
    return null;
  }

  const groups = new Map();
  for (const line of order.line_items || []) {
    const sellerSkuRaw = String(line.seller_sku || "").trim();
    const productName = String(line.product_name || "").trim() || "ไม่ระบุชื่อสินค้า";
    const variation = String(line.sku_name || "").trim();
    const quantity = Math.max(1, Number(line.quantity || 1));
    const lineSubtotal = toMoney(line.sale_price) * quantity;
    const key = [sellerSkuRaw, productName, variation].join("||");
    const current = groups.get(key) || {
      sellerSkuRaw,
      productName,
      variation,
      qty: 0,
      itemSubtotalAfterDiscount: 0,
    };
    current.qty += quantity;
    current.itemSubtotalAfterDiscount += lineSubtotal;
    groups.set(key, current);
  }

  const items = [...groups.values()].map((item, index) => {
    const parsedSku = parseSellerSku(item.sellerSkuRaw);
    return {
      orderId,
      lineNo: index + 1,
      sellerSku: parsedSku.sellerSku,
      productName: item.productName,
      variation: item.variation,
      qty: item.qty,
      itemSubtotalAfterDiscount: Number(item.itemSubtotalAfterDiscount.toFixed(2)),
      baseProductCode: parsedSku.baseProductCode || item.productName,
      packMultiplier: parsedSku.packMultiplier,
    };
  });

  return {
    orderId,
    header: {
      orderId,
      orderStatus: String(order.status || "").trim(),
      orderSubstatus: "",
      createdTime: formatBangkokDateTime(createTime),
      paidTime: formatBangkokDateTime(order.paid_time),
      deliveredTime: formatBangkokDateTime(order.delivery_time),
      orderAmount: toMoney(order.payment?.total_amount),
    },
    items,
  };
}

function hasTikTokConfig() {
  return Boolean(
    env.tiktok.appKey &&
      env.tiktok.appSecret &&
      env.tiktok.refreshToken &&
      env.tiktok.shopCipher
  );
}

function pickStoredCredentials(stored) {
  const envExpire = Number(env.tiktok.accessTokenExpire || 0);
  const storedExpire = Number(stored?.accessTokenExpire || 0);
  if (stored?.accessToken && storedExpire >= envExpire) {
    return {
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken || env.tiktok.refreshToken,
      accessTokenExpire: storedExpire,
      refreshTokenExpire: Number(stored.refreshTokenExpire || env.tiktok.refreshTokenExpire || 0),
    };
  }

  return {
    accessToken: env.tiktok.accessToken,
    refreshToken: env.tiktok.refreshToken,
    accessTokenExpire: envExpire,
    refreshTokenExpire: Number(env.tiktok.refreshTokenExpire || 0),
  };
}

async function ensureAccessToken() {
  const stored = await SyncState.findOne({ key: AUTH_STATE_KEY }).lean();
  const credentials = pickStoredCredentials(stored);
  const nowUnix = Math.floor(Date.now() / 1000);
  if (
    credentials.accessToken &&
    credentials.accessTokenExpire > nowUnix + TOKEN_REFRESH_MARGIN_SECONDS
  ) {
    return credentials.accessToken;
  }

  const refreshed = await refreshAccessToken({
    appKey: env.tiktok.appKey,
    appSecret: env.tiktok.appSecret,
    refreshToken: credentials.refreshToken,
  });

  await SyncState.updateOne(
    { key: AUTH_STATE_KEY },
    {
      $set: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || credentials.refreshToken,
        accessTokenExpire: Number(refreshed.access_token_expire_in || 0),
        refreshTokenExpire: Number(refreshed.refresh_token_expire_in || 0),
      },
    },
    { upsert: true }
  );

  return refreshed.access_token;
}

async function getApiBatch(now) {
  const existing = await Batch.findOne({ fileHash: API_BATCH_HASH });
  if (existing) {
    return existing;
  }

  return Batch.create({
    batchType: "orders",
    fileHash: API_BATCH_HASH,
    filename: "TikTok API order sync",
    uploadedBy: "tiktok-api",
    period: formatBangkokDate(now).slice(0, 7),
    status: "committed",
    warningCount: 0,
  });
}

async function fetchOrders(accessToken, window) {
  const orders = [];
  let pageToken = "";
  let pages = 0;

  do {
    pages += 1;
    if (pages > MAX_PAGES) {
      const error = new Error("Order sync stopped because the result had too many pages.");
      error.statusCode = 502;
      throw error;
    }

    const page = await searchOrdersPage({
      appKey: env.tiktok.appKey,
      appSecret: env.tiktok.appSecret,
      accessToken,
      shopCipher: env.tiktok.shopCipher,
      pageSize: PAGE_SIZE,
      pageToken,
      sortField: window.sortField,
      filters: window.filters,
    });
    orders.push(...page.orders);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return { orders, pages };
}

function canWriteOrder(existingHeader, batchId, { missingOnly }) {
  if (!existingHeader) {
    return true;
  }
  return !missingOnly && String(existingHeader.batchId) === String(batchId);
}

async function writeOrders(orders, { floorUnix, batchId, missingOnly }) {
  let upserted = 0;
  let skipped = 0;

  for (const order of orders) {
    const mapped = mapTikTokOrder(order, floorUnix);
    if (!mapped) {
      continue;
    }
    const existing = await OrderHeader.findOne({ orderId: mapped.orderId })
      .select({ batchId: 1 })
      .lean();
    if (!canWriteOrder(existing, batchId, { missingOnly })) {
      skipped += 1;
      continue;
    }
    await upsertMappedOrder(mapped, batchId);
    upserted += 1;
  }

  return { upserted, skipped };
}

async function runBackfillOnce({ accessToken, floorUnix, nowUnix, batchId }) {
  const state = await SyncState.findOne({ key: BACKFILL_STATE_KEY }).lean();
  if (Number(state?.version || 0) >= BACKFILL_VERSION) {
    return null;
  }

  const { orders, pages } = await fetchOrders(accessToken, {
    sortField: "create_time",
    filters: {
      create_time_ge: floorUnix,
      create_time_lt: nowUnix,
    },
  });
  const result = await writeOrders(orders, { floorUnix, batchId, missingOnly: true });
  const stats = { fetched: orders.length, pages, ...result };

  await SyncState.updateOne(
    { key: BACKFILL_STATE_KEY },
    { $set: { version: BACKFILL_VERSION, lastSuccessAt: new Date(), lastStats: stats } },
    { upsert: true }
  );
  console.log(`Order backfill inserted ${result.upserted} missing orders`);
  return stats;
}

async function upsertMappedOrder(mapped, batchId) {
  await OrderItem.deleteMany({ orderId: mapped.orderId });
  await OrderHeader.deleteMany({ orderId: mapped.orderId });
  await OrderHeader.create({
    ...mapped.header,
    batchId,
  });
  if (mapped.items.length > 0) {
    await OrderItem.insertMany(
      mapped.items.map((item) => ({
        ...item,
        batchId,
      }))
    );
  }
}

async function runOrderSync() {
  if (!hasTikTokConfig()) {
    return {
      ok: true,
      skipped: true,
      reason: "missing_tiktok_config",
    };
  }

  const now = new Date();
  const nowUnix = Math.floor(now.getTime() / 1000);
  const floorUnix = getSyncFloorUnix();
  const syncState = await SyncState.findOne({ key: SYNC_STATE_KEY }).lean();
  const window = computeSyncWindow({
    nowUnix,
    floorUnix,
    startOfTodayUnix: getBangkokStartOfTodayUnix(now),
    cursorUnix: syncState?.cursorUnix,
  });

  await SyncState.updateOne(
    { key: SYNC_STATE_KEY },
    { $set: { lastRunAt: now, lastError: "" } },
    { upsert: true }
  );

  try {
    const accessToken = await ensureAccessToken();
    const batch = await getApiBatch(now);
    const backfill = await runBackfillOnce({
      accessToken,
      floorUnix,
      nowUnix,
      batchId: batch._id,
    });
    const { orders, pages } = await fetchOrders(accessToken, window);
    const { upserted, skipped } = await writeOrders(orders, {
      floorUnix,
      batchId: batch._id,
      missingOnly: false,
    });

    const lastStats = {
      mode: window.mode,
      fetched: orders.length,
      upserted,
      skippedFileOrders: skipped,
      pages,
      ...(backfill ? { backfillInserted: backfill.upserted } : {}),
    };
    await SyncState.updateOne(
      { key: SYNC_STATE_KEY },
      {
        $set: {
          cursorUnix: nowUnix,
          lastSuccessAt: new Date(),
          lastError: "",
          lastStats,
        },
      },
      { upsert: true }
    );

    return {
      ok: true,
      skipped: false,
      ...lastStats,
    };
  } catch (error) {
    await SyncState.updateOne(
      { key: SYNC_STATE_KEY },
      { $set: { lastError: error.message || "Order sync failed" } },
      { upsert: true }
    );
    throw error;
  }
}

function syncOrders() {
  if (!currentRun) {
    currentRun = runOrderSync().finally(() => {
      currentRun = null;
    });
  }
  return currentRun;
}

async function getOrderSyncStatus() {
  const state = await SyncState.findOne({ key: SYNC_STATE_KEY }).lean();
  const today = formatBangkokDate();
  const ordersCreatedToday = await OrderHeader.countDocuments({
    createdTime: { $regex: `^${today}` },
  });

  return {
    ok: true,
    enabled: hasTikTokConfig(),
    running: Boolean(currentRun),
    intervalMinutes: 60,
    overlapHours: 3,
    scope: "orders_since_start_date",
    startDate: env.orderSyncStartDate,
    lastRunAt: state?.lastRunAt || null,
    lastSuccessAt: state?.lastSuccessAt || null,
    lastError: state?.lastError || "",
    lastStats: state?.lastStats || null,
    ordersCreatedToday,
  };
}

function startOrderSyncScheduler() {
  if (startOrderSyncScheduler.started) {
    return;
  }
  startOrderSyncScheduler.started = true;

  const run = () => {
    syncOrders()
      .then((result) => {
        if (!result?.skipped) {
          console.log(`Order sync updated ${result.upserted} orders`);
        }
      })
      .catch((error) => {
        console.error(`Order sync failed: ${error.message}`);
      });
  };

  setTimeout(run, 5000);
  setInterval(run, 60 * 60 * 1000);
}

module.exports = {
  canWriteOrder,
  computeSyncWindow,
  formatBangkokDateTime,
  getBangkokStartOfTodayUnix,
  getOrderSyncStatus,
  mapTikTokOrder,
  startOrderSyncScheduler,
  syncOrders,
};
