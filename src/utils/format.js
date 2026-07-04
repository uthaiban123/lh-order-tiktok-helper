function formatNumber(value, fractionDigits = 0) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value || 0));
}

function formatMoney(value) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${formatNumber(value, 2)}%`;
}

function formatIsoDateTh(value) {
  const [year, month, day] = String(value || "").split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  if (!year || !month || !day || Number.isNaN(date.getTime())) {
    return String(value || "-");
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
  }).format(date);
}

function formatPeriodLabel(startDate, endDate) {
  if (!startDate || !endDate) {
    return "-";
  }

  if (startDate === endDate) {
    return formatIsoDateTh(startDate);
  }

  return `${formatIsoDateTh(startDate)} – ${formatIsoDateTh(endDate)}`;
}

module.exports = {
  formatMoney,
  formatNumber,
  formatPercent,
  formatIsoDateTh,
  formatPeriodLabel,
};
