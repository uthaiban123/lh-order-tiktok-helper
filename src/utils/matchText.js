function normalizeMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMatchKey(productName, variationValue = "") {
  const name = normalizeMatchText(productName);
  const variation = normalizeMatchText(variationValue);
  if (!name && !variation) {
    return "";
  }
  return variation ? `${name}|${variation}` : name;
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, (_, rowIndex) => [rowIndex]);
  for (let columnIndex = 1; columnIndex <= a.length; columnIndex += 1) {
    matrix[0][columnIndex] = columnIndex;
  }

  for (let rowIndex = 1; rowIndex <= b.length; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= a.length; columnIndex += 1) {
      const cost = b[rowIndex - 1] === a[columnIndex - 1] ? 0 : 1;
      matrix[rowIndex][columnIndex] = Math.min(
        matrix[rowIndex - 1][columnIndex] + 1,
        matrix[rowIndex][columnIndex - 1] + 1,
        matrix[rowIndex - 1][columnIndex - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

function similarityScore(left, right) {
  const a = normalizeMatchText(left);
  const b = normalizeMatchText(right);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return Math.round(80 + (shorter / longer) * 20);
  }

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.round((1 - distance / maxLen) * 100);
}

function scoreMatchKeys(sourceKey, candidateKey) {
  if (!sourceKey || !candidateKey) return 0;
  if (sourceKey === candidateKey) return 100;

  const [sourceName, sourceVariation = ""] = sourceKey.split("|");
  const [candidateName, candidateVariation = ""] = candidateKey.split("|");

  const nameScore = similarityScore(sourceName, candidateName);
  const variationScore =
    sourceVariation && candidateVariation
      ? similarityScore(sourceVariation, candidateVariation)
      : nameScore;

  if (!sourceVariation || !candidateVariation) {
    return Math.round(nameScore * 0.85 + variationScore * 0.15);
  }

  return Math.round(nameScore * 0.55 + variationScore * 0.45);
}

module.exports = {
  normalizeMatchText,
  buildMatchKey,
  similarityScore,
  scoreMatchKeys,
};
