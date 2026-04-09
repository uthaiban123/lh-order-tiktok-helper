function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value || "").replace(/,/g, "").trim();
  if (!text) {
    return 0;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = {
  toNumber,
};
