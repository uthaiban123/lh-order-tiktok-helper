function toIsoDateOnly(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const yearSlashMatch = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (yearSlashMatch) {
    const year = yearSlashMatch[1];
    const month = yearSlashMatch[2].padStart(2, "0");
    const day = yearSlashMatch[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  return "";
}

function toMonthKey(value) {
  const date = toIsoDateOnly(value);
  return date ? date.slice(0, 7) : "";
}

module.exports = {
  toIsoDateOnly,
  toMonthKey,
};
