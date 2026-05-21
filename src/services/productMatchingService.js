const ProductMaster = require("../models/ProductMaster");
const PendingPlatformListing = require("../models/PendingPlatformListing");
const { buildMatchKey, scoreMatchKeys } = require("../utils/matchText");

const AUTO_LINK_SCORE = 95;
const SUGGEST_MIN_SCORE = 60;

function pickBestMatch(sourceKey, candidates) {
  let best = null;
  for (const candidate of candidates) {
    const score = scoreMatchKeys(sourceKey, candidate.matchKey);
    if (!best || score > best.score) {
      best = { ...candidate, score };
    }
  }
  return best;
}

async function loadMasterCandidates() {
  const items = await ProductMaster.find(
    { skuId: { $exists: true, $ne: "" } },
    {
      _id: 1,
      skuId: 1,
      productName: 1,
      variationValue: 1,
      sellerSku: 1,
      matchKey: 1,
    }
  ).lean();

  return items.map((item) => ({
    _id: item._id,
    skuId: item.skuId,
    sellerSku: item.sellerSku,
    productName: item.productName,
    variationValue: item.variationValue,
    matchKey: item.matchKey || buildMatchKey(item.productName, item.variationValue),
  }));
}

async function suggestLinksForPlatform(platform, { autoLink = false } = {}) {
  const pendingItems = await PendingPlatformListing.find({
    platform,
    status: { $in: ["pending", "suggested"] },
  }).lean();

  if (pendingItems.length === 0) {
    return { platform, processed: 0, suggested: 0, autoLinked: 0 };
  }

  const masters = await loadMasterCandidates();
  let suggested = 0;
  let autoLinked = 0;

  for (const pending of pendingItems) {
    const best = pickBestMatch(pending.matchKey, masters);
    if (!best || best.score < SUGGEST_MIN_SCORE) {
      await PendingPlatformListing.updateOne(
        { _id: pending._id },
        {
          $set: {
            status: "pending",
            matchScore: best?.score || 0,
            suggestedProductMasterId: null,
            suggestedSkuId: "",
          },
        }
      );
      continue;
    }

    const shouldAutoLink = autoLink && best.score >= AUTO_LINK_SCORE;
    if (shouldAutoLink) {
      await confirmLink({
        pendingId: pending._id,
        productMasterId: best._id,
        matchedBy: "name",
      });
      autoLinked += 1;
      continue;
    }

    await PendingPlatformListing.updateOne(
      { _id: pending._id },
      {
        $set: {
          status: "suggested",
          matchScore: best.score,
          suggestedProductMasterId: best._id,
          suggestedSkuId: best.skuId,
        },
      }
    );
    suggested += 1;
  }

  return {
    platform,
    processed: pendingItems.length,
    suggested,
    autoLinked,
  };
}

async function confirmLink({ pendingId, productMasterId, matchedBy = "manual" }) {
  const pending = await PendingPlatformListing.findById(pendingId).lean();
  if (!pending) {
    const error = new Error("pending listing not found");
    error.statusCode = 404;
    throw error;
  }

  const master = await ProductMaster.findById(productMasterId);
  if (!master) {
    const error = new Error("product master not found");
    error.statusCode = 404;
    throw error;
  }

  const platformField = pending.platform;
  const platformPayload = {
    ...(master.platforms?.[platformField] || {}),
    ...pending.platformData,
    productName: pending.productName || master.productName,
    variationName: pending.variationName,
    price: pending.price,
    linkStatus: matchedBy === "manual" ? "manual" : "linked",
    matchScore: pending.matchScore,
    matchedBy,
    linkedAt: new Date(),
    lastImportedAt: new Date(),
  };

  master.platforms = master.platforms || {};
  master.platforms[platformField] = platformPayload;
  master.markModified("platforms");
  await master.save();

  await PendingPlatformListing.updateOne(
    { _id: pending._id },
    {
      $set: {
        status: "linked",
        linkedProductMasterId: master._id,
        linkedAt: new Date(),
        matchedBy,
      },
    }
  );

  return {
    ok: true,
    pendingId: pending._id,
    productMasterId: master._id,
    skuId: master.skuId,
    platform: platformField,
  };
}

async function skipPending(pendingId) {
  const result = await PendingPlatformListing.updateOne(
    { _id: pendingId },
    { $set: { status: "skipped" } }
  );
  if (result.matchedCount === 0) {
    const error = new Error("pending listing not found");
    error.statusCode = 404;
    throw error;
  }
  return { ok: true, pendingId };
}

async function listPending({ platform, status = "open", limit = 50, page = 1 }) {
  const filter = { platform };
  if (status === "open") {
    filter.status = { $in: ["pending", "suggested"] };
  } else if (status && status !== "all") {
    filter.status = status;
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    PendingPlatformListing.find(filter).sort({ matchScore: -1, updatedAt: -1 }).skip(skip).limit(limit).lean(),
    PendingPlatformListing.countDocuments(filter),
  ]);

  const masterIds = [
    ...new Set(
      items
        .flatMap((item) => [item.suggestedProductMasterId, item.linkedProductMasterId])
        .filter(Boolean)
        .map(String)
    ),
  ];

  const masters = await ProductMaster.find(
    { _id: { $in: masterIds } },
    { skuId: 1, productName: 1, variationValue: 1, sellerSku: 1, canonicalPrice: 1, price: 1 }
  ).lean();
  const masterById = new Map(masters.map((m) => [String(m._id), m]));

  const enriched = items.map((item) => ({
    ...item,
    suggestion: item.suggestedProductMasterId
      ? masterById.get(String(item.suggestedProductMasterId)) || null
      : null,
  }));

  return {
    items: enriched,
    pagination: {
      page: Math.max(1, page),
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = {
  AUTO_LINK_SCORE,
  SUGGEST_MIN_SCORE,
  suggestLinksForPlatform,
  confirmLink,
  skipPending,
  listPending,
  buildMatchKey,
};
