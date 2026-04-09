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

module.exports = {
  formatMoney,
  formatNumber,
  formatPercent,
};
