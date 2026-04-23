function normalizeFilename(value) {
  const original = String(value || "").trim();
  if (!original) {
    return "";
  }

  let decoded = original;

  try {
    decoded = Buffer.from(original, "latin1").toString("utf8");
  } catch (error) {
    return original;
  }

  const hasThaiCharacters = /[\u0E00-\u0E7F]/.test(decoded);
  const looksMojibake = /(?:Ã.|à[\u0080-\u00FF]?)/.test(original);

  if (looksMojibake && hasThaiCharacters && !decoded.includes("\uFFFD")) {
    return decoded;
  }

  return original;
}

module.exports = {
  normalizeFilename,
};
