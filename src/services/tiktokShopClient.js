const crypto = require("crypto");

const AUTH_BASE_URL = "https://auth.tiktok-shops.com";
const API_BASE_URL = "https://open-api.tiktokglobalshop.com";

function buildSign({ path, params, body, appSecret }) {
  const paramString = Object.keys(params)
    .filter((key) => key !== "sign" && key !== "access_token")
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  const base = `${appSecret}${path}${paramString}${body || ""}${appSecret}`;
  return crypto.createHmac("sha256", appSecret).update(base).digest("hex");
}

async function readJson(response) {
  const payload = await response.json();
  if (payload.code !== 0) {
    const error = new Error(payload.message || "TikTok Shop API request failed");
    error.statusCode = 502;
    error.tiktokCode = payload.code;
    throw error;
  }
  return payload.data || {};
}

function compactParams(params) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)])
  );
}

async function signedRequest({
  method,
  path,
  query,
  body,
  appKey,
  appSecret,
  accessToken,
}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params = compactParams({
    ...query,
    app_key: appKey,
    timestamp,
  });
  const bodyString = body ? JSON.stringify(body) : "";
  const sign = buildSign({
    path,
    params,
    body: bodyString,
    appSecret,
  });
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries({ ...params, sign })) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": accessToken,
    },
    body: bodyString || undefined,
  });
  return readJson(response);
}

async function refreshAccessToken({ appKey, appSecret, refreshToken }) {
  const url = new URL(`${AUTH_BASE_URL}/api/v2/token/refresh`);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("app_secret", appSecret);
  url.searchParams.set("refresh_token", refreshToken);
  url.searchParams.set("grant_type", "refresh_token");

  const response = await fetch(url);
  return readJson(response);
}

async function searchOrdersPage({
  appKey,
  appSecret,
  accessToken,
  shopCipher,
  pageSize,
  pageToken,
  sortField,
  filters,
}) {
  const data = await signedRequest({
    method: "POST",
    path: "/order/202309/orders/search",
    appKey,
    appSecret,
    accessToken,
    query: {
      shop_cipher: shopCipher,
      page_size: pageSize,
      sort_field: sortField,
      sort_order: "ASC",
      page_token: pageToken || "",
    },
    body: filters,
  });

  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    nextPageToken: data.next_page_token || "",
  };
}

module.exports = {
  buildSign,
  refreshAccessToken,
  searchOrdersPage,
};
