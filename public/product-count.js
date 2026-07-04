const startDateInput = document.getElementById("start-date");
const endDateInput = document.getElementById("end-date");
const skuSearchInput = document.getElementById("sku-search-input");
const skuSearchButton = document.getElementById("sku-search-button");
const selectAllButton = document.getElementById("select-all-button");
const clearSelectionButton = document.getElementById("clear-selection-button");
const skuList = document.getElementById("sku-list");
const selectedCountBadge = document.getElementById("selected-count-badge");
const countButton = document.getElementById("count-button");
const reportButton = document.getElementById("report-button");
const exportButton = document.getElementById("export-button");
const countStatus = document.getElementById("count-status");
const summaryPanel = document.getElementById("summary-panel");
const resultTableBody = document.getElementById("result-table-body");
const resultTableFoot = document.getElementById("result-table-foot");
const statSettledOrders = document.getElementById("stat-settled-orders");
const statCoverage = document.getElementById("stat-coverage");
const statSoldUnits = document.getElementById("stat-sold-units");
const statBaseUnits = document.getElementById("stat-base-units");
const totalOrders = document.getElementById("total-orders");
const totalSoldUnits = document.getElementById("total-sold-units");
const totalBaseUnits = document.getElementById("total-base-units");

const numberFormatter = new Intl.NumberFormat("th-TH");
const percentFormatter = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

let availableSkus = [];
let selectedSkus = new Set();
let lastResult = null;

function buildQueryParams(result) {
  return new URLSearchParams({
    startDate: result.startDate,
    endDate: result.endDate,
    sellerSkus: result.sellerSkus.join(","),
  });
}

function buildReportUrl(result, { autoPrint = false } = {}) {
  const params = buildQueryParams(result);

  if (autoPrint) {
    params.set("print", "1");
  }

  return `/product-count/report?${params.toString()}`;
}

function buildExportUrl(result) {
  return `/product-count/export?${buildQueryParams(result).toString()}`;
}

function setReportActionsEnabled(enabled) {
  reportButton.disabled = !enabled;
  exportButton.disabled = !enabled;
}

function formatNumber(value) {
  return numberFormatter.format(Number(value || 0));
}

function formatPercent(value) {
  return `${percentFormatter.format(Number(value || 0))}%`;
}

function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]
  );
}

function getTodayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthStartIso() {
  const today = getTodayIso();
  return `${today.slice(0, 7)}-01`;
}

function setDefaultDates() {
  if (startDateInput && !startDateInput.value) {
    startDateInput.value = getMonthStartIso();
  }
  if (endDateInput && !endDateInput.value) {
    endDateInput.value = getTodayIso();
  }
}

function updateSelectedBadge() {
  selectedCountBadge.textContent = `เลือกแล้ว ${formatNumber(selectedSkus.size)} SKU`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Request failed");
  }
  return payload;
}

function renderSkuList() {
  if (!availableSkus.length) {
    skuList.innerHTML =
      '<p class="support-copy">ไม่พบ Seller SKU — ลองค้นหาด้วยคำอื่น หรืออัปโหลด Product Master / Orders ก่อน</p>';
    return;
  }

  skuList.innerHTML = availableSkus
    .map((item) => {
      const checked = selectedSkus.has(item.sellerSku) ? "checked" : "";
      const sourceLabel = item.source === "product_master" ? "Master" : "Order";
      return `
        <label class="sku-item">
          <input type="checkbox" value="${escapeHtml(item.sellerSku)}" ${checked} />
          <span class="sku-item-body">
            <strong>${escapeHtml(item.sellerSku)}</strong>
            <span>${escapeHtml(item.productName || "-")}</span>
            <span class="sku-item-meta">
              base: ${escapeHtml(item.baseProductCode || "-")}
              · ตัวคูณ: ${formatNumber(item.packMultiplier || 1)}
              · ${sourceLabel}
            </span>
          </span>
        </label>
      `;
    })
    .join("");
}

async function loadSellerSkus(search = "") {
  skuList.innerHTML = '<p class="support-copy">กำลังโหลดรายการ Seller SKU...</p>';

  try {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    const payload = await fetchJson(`/api/tiktok-settled-sales/seller-skus${query}`);
    availableSkus = payload.items || [];
    renderSkuList();
  } catch (error) {
    skuList.innerHTML = `<p class="support-copy">โหลด Seller SKU ไม่สำเร็จ: ${escapeHtml(error.message)}</p>`;
  }
}

function getSelectedSkusFromForm() {
  return [...skuList.querySelectorAll('input[type="checkbox"]:checked')].map(
    (input) => input.value
  );
}

function syncSelectedSkus() {
  selectedSkus = new Set(getSelectedSkusFromForm());
  updateSelectedBadge();
}

function renderResults(result) {
  lastResult = result;

  if (!result.items.length) {
    resultTableBody.innerHTML =
      '<tr><td colspan="7" class="empty-state">ไม่พบข้อมูลขายในช่วงวันที่และ Seller SKU ที่เลือก</td></tr>';
    resultTableFoot.classList.add("hidden");
    summaryPanel.classList.remove("hidden");
    statSettledOrders.textContent = formatNumber(result.sourceStats.settledOrders);
    statCoverage.textContent = formatPercent(result.sourceStats.coveragePercent);
    statSoldUnits.textContent = "0";
    statBaseUnits.textContent = "0";
    setReportActionsEnabled(true);
    return;
  }

  resultTableBody.innerHTML = result.items
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.sellerSku)}</td>
          <td>${escapeHtml(row.productName)}</td>
          <td>${escapeHtml(row.baseProductCode || "-")}</td>
          <td>${formatNumber(row.packMultiplier)}</td>
          <td>${formatNumber(row.ordersCount)}</td>
          <td>${formatNumber(row.soldUnitsTikTok)}</td>
          <td>${formatNumber(row.equivalentBaseUnits)}</td>
        </tr>
      `
    )
    .join("");

  totalOrders.textContent = formatNumber(result.totals.ordersCount);
  totalSoldUnits.textContent = formatNumber(result.totals.soldUnitsTikTok);
  totalBaseUnits.textContent = formatNumber(result.totals.equivalentBaseUnits);
  resultTableFoot.classList.remove("hidden");

  statSettledOrders.textContent = formatNumber(result.sourceStats.settledOrders);
  statCoverage.textContent = formatPercent(result.sourceStats.coveragePercent);
  statSoldUnits.textContent = formatNumber(result.totals.soldUnitsTikTok);
  statBaseUnits.textContent = formatNumber(result.totals.equivalentBaseUnits);
  summaryPanel.classList.remove("hidden");
  setReportActionsEnabled(true);
}

async function runCount() {
  syncSelectedSkus();

  const startDate = startDateInput.value;
  const endDate = endDateInput.value;
  const sellerSkus = [...selectedSkus];

  if (!startDate || !endDate) {
    countStatus.textContent = "กรุณาเลือกช่วงวันที่ให้ครบ";
    return;
  }

  if (!sellerSkus.length) {
    countStatus.textContent = "กรุณาเลือก Seller SKU อย่างน้อย 1 รายการ";
    return;
  }

  countButton.disabled = true;
  countButton.textContent = "กำลังนับ...";
  countStatus.textContent = "กำลังคำนวณจำนวนสินค้า...";

  try {
    const params = new URLSearchParams({
      startDate,
      endDate,
      sellerSkus: sellerSkus.join(","),
    });
    const result = await fetchJson(
      `/api/tiktok-settled-sales/product-count?${params.toString()}`
    );
    renderResults(result);
    countStatus.textContent = `นับเสร็จแล้ว: ${formatIsoRange(result.startDate, result.endDate)} · ${formatNumber(result.items.length)} SKU มีข้อมูลขาย`;
  } catch (error) {
    countStatus.textContent = `นับไม่สำเร็จ: ${error.message}`;
  } finally {
    countButton.disabled = false;
    countButton.textContent = "นับจำนวนสินค้า";
  }
}

function formatIsoRange(startDate, endDate) {
  if (startDate === endDate) {
    return startDate;
  }
  return `${startDate} ถึง ${endDate}`;
}

function exportCsv() {
  if (!lastResult) {
    return;
  }

  window.location.href = buildExportUrl(lastResult);
}

function openReport({ autoPrint = false } = {}) {
  if (!lastResult) {
    return;
  }

  window.open(buildReportUrl(lastResult, { autoPrint }), "_blank", "noopener");
}

skuList.addEventListener("change", () => {
  syncSelectedSkus();
});

skuSearchButton.addEventListener("click", () => {
  loadSellerSkus(skuSearchInput.value.trim());
});

skuSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    loadSellerSkus(skuSearchInput.value.trim());
  }
});

selectAllButton.addEventListener("click", () => {
  skuList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = true;
  });
  syncSelectedSkus();
});

clearSelectionButton.addEventListener("click", () => {
  skuList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = false;
  });
  syncSelectedSkus();
});

countButton.addEventListener("click", runCount);
reportButton.addEventListener("click", () => openReport({ autoPrint: true }));
exportButton.addEventListener("click", exportCsv);

setDefaultDates();
updateSelectedBadge();
loadSellerSkus();
