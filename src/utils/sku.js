function parseSellerSku(sellerSku) {
  const raw = String(sellerSku || "").trim();
  if (!raw) {
    return {
      sellerSku: "",
      baseProductCode: "",
      packMultiplier: 1,
    };
  }

  const lastDashIndex = raw.lastIndexOf("-");
  if (lastDashIndex === -1) {
    return {
      sellerSku: raw,
      baseProductCode: raw,
      packMultiplier: 1,
    };
  }

  const baseProductCode = raw.slice(0, lastDashIndex).trim();
  const suffix = raw.slice(lastDashIndex + 1).trim();
  const packMultiplier = Number.parseInt(suffix, 10);

  if (!baseProductCode || Number.isNaN(packMultiplier) || packMultiplier <= 0) {
    return {
      sellerSku: raw,
      baseProductCode: raw,
      packMultiplier: 1,
    };
  }

  return {
    sellerSku: raw,
    baseProductCode,
    packMultiplier,
  };
}

module.exports = {
  parseSellerSku,
};
