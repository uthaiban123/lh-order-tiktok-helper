const output = document.getElementById("output");
const healthStatus = document.getElementById("health-status");
const initDbButton = document.getElementById("init-db-button");
const systemBadge = document.getElementById("system-badge");
const readinessBadge = document.getElementById("readiness-badge");
const nextStepHint = document.getElementById("next-step-hint");

const productMasterImportForm = document.getElementById("product-master-import-form");
const ordersImportForm = document.getElementById("orders-import-form");
const incomeImportForm = document.getElementById("income-import-form");
const dailyForm = document.getElementById("daily-form");
const monthlyForm = document.getElementById("monthly-form");
const dailyDateInput = document.getElementById("daily-date");
const monthlyMonthInput = document.getElementById("monthly-month");
const calendarMonthLabel = document.getElementById("calendar-month-label");
const calendarSummary = document.getElementById("calendar-summary");
const calendarStatus = document.getElementById("calendar-status");
const calendarGrid = document.getElementById("calendar-grid");
const calendarPrevButton = document.getElementById("calendar-prev-button");
const calendarNextButton = document.getElementById("calendar-next-button");
const calendarTodayButton = document.getElementById("calendar-today-button");
const todayWorkflowSummary = document.getElementById("today-workflow-summary");
const todayWorkflowBadge = document.getElementById("today-workflow-badge");
const todayWorkflowTitle = document.getElementById("today-workflow-title");
const todayWorkflowCopy = document.getElementById("today-workflow-copy");
const todayReportLink = document.getElementById("today-report-link");
const todaySettledOrders = document.getElementById("today-settled-orders");
const todayCoverage = document.getElementById("today-coverage");
const todayWarningCount = document.getElementById("today-warning-count");
const todayImportCount = document.getElementById("today-import-count");
const todayNextSteps = document.getElementById("today-next-steps");
const todayWarningList = document.getElementById("today-warning-list");
const recentImportList = document.getElementById("recent-import-list");

const numberFormatter = new Intl.NumberFormat("th-TH");
const percentFormatter = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
});
let lastHealthCounts = null;
let calendarMonth = "";
let calendarDataByDate = new Map();

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const statusNodes = {
  orders: {
    card: document.getElementById("orders-status-card"),
    text: document.getElementById("orders-status-text"),
    count: document.getElementById("orders-count"),
    feedback: document.getElementById("orders-last-result"),
  },
  income: {
    card: document.getElementById("income-status-card"),
    text: document.getElementById("income-status-text"),
    count: document.getElementById("income-count"),
    feedback: document.getElementById("income-last-result"),
  },
  productMaster: {
    card: document.getElementById("product-master-status-card"),
    text: document.getElementById("product-master-status-text"),
    count: document.getElementById("product-master-count"),
    feedback: document.getElementById("product-master-last-result"),
  },
};

function renderJson(data) {
  output.textContent = JSON.stringify(data, null, 2);
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

function formatNumber(value) {
  return numberFormatter.format(Number(value || 0));
}

function formatPercent(value) {
  return `${percentFormatter.format(Number(value || 0))}%`;
}

function getDateParts(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    day: String(date.getDate()).padStart(2, "0"),
  };
}

function getTodayIso() {
  const { year, month, day } = getDateParts();
  return `${year}-${month}-${day}`;
}

function getCurrentMonthValue() {
  return getTodayIso().slice(0, 7);
}

function formatIsoDate(value) {
  const [year, month, day] = String(value || "").split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  if (!year || !month || !day || Number.isNaN(date.getTime())) {
    return "-";
  }

  return dateFormatter.format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return dateTimeFormatter.format(date);
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return dateFormatter.format(date);
}

function isSameLocalDate(value, isoDate) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const { year, month, day } = getDateParts(date);
  return `${year}-${month}-${day}` === isoDate;
}

function formatMonthLabel(month) {
  const [year, rawMonth] = String(month || "").split("-");
  const monthIndex = Number(rawMonth) - 1;

  if (!year || monthIndex < 0 || monthIndex > 11) {
    return "เลือกเดือน";
  }

  return `${THAI_MONTHS[monthIndex]} ${year}`;
}

function shiftMonth(month, delta) {
  const [year, rawMonth] = String(month || getCurrentMonthValue()).split("-");
  const date = new Date(Number(year), Number(rawMonth) - 1 + delta, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

function setDefaultPeriods() {
  const today = getTodayIso();
  const month = today.slice(0, 7);

  if (dailyDateInput && !dailyDateInput.value) {
    dailyDateInput.value = today;
  }

  if (monthlyMonthInput && !monthlyMonthInput.value) {
    monthlyMonthInput.value = month;
  }
}

function setChipState(element, state, label) {
  if (!element) {
    return;
  }

  element.dataset.state = state;
  element.textContent = label;
}

function setStatusCardState(config, options) {
  config.card.dataset.state = options.cardState;
  setChipState(config.text, options.chipState, options.label);
  config.count.textContent = options.countLabel;
}

function getReadiness(counts) {
  const hasOrders = Number(counts?.orderItems || 0) > 0;
  const hasIncome = Number(counts?.incomeEntries || 0) > 0;
  const hasProductMaster = Number(counts?.productMasters || 0) > 0;

  return {
    hasOrders,
    hasIncome,
    hasProductMaster,
    isReady: hasOrders && hasIncome,
  };
}

function updateHealthUI(counts) {
  const readiness = getReadiness(counts);

  setChipState(systemBadge, "ready", "ระบบพร้อมใช้งาน");
  healthStatus.textContent =
    `ข้อมูลในระบบ: batches ${formatNumber(counts.batches)}, ` +
    `income ${formatNumber(counts.incomeEntries)}, ` +
    `order items ${formatNumber(counts.orderItems)}, ` +
    `product master ${formatNumber(counts.productMasters)}`;

  setStatusCardState(statusNodes.orders, {
    cardState: readiness.hasOrders ? "ready" : "waiting",
    chipState: readiness.hasOrders ? "ready" : "waiting",
    label: readiness.hasOrders ? "พร้อมใช้งาน" : "ยังไม่มีข้อมูล",
    countLabel: `${formatNumber(counts.orderItems)} แถวสินค้า`,
  });

  setStatusCardState(statusNodes.income, {
    cardState: readiness.hasIncome ? "ready" : "waiting",
    chipState: readiness.hasIncome ? "ready" : "waiting",
    label: readiness.hasIncome ? "พร้อมใช้งาน" : "ยังไม่มีข้อมูล",
    countLabel: `${formatNumber(counts.incomeEntries)} รายการ`,
  });

  setStatusCardState(statusNodes.productMaster, {
    cardState: readiness.hasProductMaster ? "ready" : "optional",
    chipState: readiness.hasProductMaster ? "ready" : "waiting",
    label: readiness.hasProductMaster ? "โหลดแล้ว" : "ไม่บังคับ",
    countLabel: `${formatNumber(counts.productMasters)} SKU`,
  });

  if (readiness.isReady) {
    setChipState(readinessBadge, "ready", "พร้อมสรุปรายงาน");
    nextStepHint.textContent = readiness.hasProductMaster
      ? "ข้อมูลหลักพร้อมแล้ว สามารถดูรายงานรายวันหรือรายเดือนได้ทันที"
      : "ข้อมูลหลักพร้อมแล้ว สามารถสรุปรายงานได้ทันที และอัปโหลด Product Master เพิ่มได้หากต้องการความแม่นยำของชื่อสินค้า";
  } else if (readiness.hasOrders || readiness.hasIncome) {
    setChipState(readinessBadge, "loading", "ขาดอีก 1 ไฟล์หลัก");
    nextStepHint.textContent = readiness.hasOrders
      ? "เหลืออัปโหลดไฟล์ Income อีก 1 ไฟล์เพื่อให้ระบบสรุปรายงานได้ครบ"
      : "เหลืออัปโหลดไฟล์ Order อีก 1 ไฟล์เพื่อให้ระบบสรุปรายงานได้ครบ";
  } else {
    setChipState(readinessBadge, "waiting", "รอข้อมูลหลัก");
    nextStepHint.textContent =
      "ต้องมีอย่างน้อย 2 ไฟล์หลักคือ Orders และ Income ก่อนจึงจะสรุปรายงานได้ครบ";
  }
}

function setHealthError(message) {
  setChipState(systemBadge, "error", "ระบบมีปัญหา");
  setChipState(readinessBadge, "error", "ตรวจสถานะไม่ได้");
  healthStatus.textContent = message;
  nextStepHint.textContent = "ยังไม่สามารถประเมินความพร้อมของข้อมูลได้จนกว่าจะเชื่อมต่อระบบสำเร็จ";
}

function setCalendarLoadingState(message) {
  calendarStatus.textContent = message;
  calendarGrid.setAttribute("aria-busy", "true");
}

function setCalendarIdleState(message) {
  calendarStatus.textContent = message;
  calendarGrid.setAttribute("aria-busy", "false");
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Request failed");
  }

  return payload;
}

async function postForm(url, formElement) {
  const formData = new FormData(formElement);
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Request failed");
  }

  return payload;
}

async function loadHealth() {
  try {
    const data = await fetchJson("/api/tiktok-settled-sales/health");
    lastHealthCounts = data.counts;
    updateHealthUI(data.counts);
    return data.counts;
  } catch (error) {
    setHealthError(`ตรวจสอบระบบไม่สำเร็จ: ${error.message}`);
    throw error;
  }
}

function showNotice({ icon, title, html, timer }) {
  if (window.Swal) {
    return window.Swal.fire({
      icon,
      title,
      html,
      confirmButtonText: "รับทราบ",
      timer,
      timerProgressBar: Boolean(timer),
    });
  }

  window.alert([title, html.replace(/<[^>]+>/g, " ")].join("\n"));
  return Promise.resolve();
}

function showConfirmNotice({ title, html, confirmButtonText }) {
  if (window.Swal) {
    return window.Swal.fire({
      icon: "question",
      title,
      html,
      showCancelButton: true,
      confirmButtonText: confirmButtonText || "เปิดรายงาน",
      cancelButtonText: "ยกเลิก",
      reverseButtons: true,
    });
  }

  return Promise.resolve({
    isConfirmed: window.confirm(title),
  });
}

function setBusyState(form, isBusy, busyLabel) {
  if (!form) {
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  if (!button) {
    return;
  }

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent;
  }

  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : button.dataset.defaultLabel;
}

function resetFileInput(form) {
  if (!form) {
    return;
  }

  const input = form.querySelector('input[type="file"]');
  if (input) {
    input.value = "";
  }
}

function updateImportFeedback(kind, data) {
  const feedbackMap = {
    orders: `นำเข้า ${data.filename || "-"} แล้ว: ${formatNumber(data.insertedOrderHeaders)} orders / ${formatNumber(data.insertedOrderItems)} items`,
    income: data.skippedReason === "duplicate_file_hash"
      ? `ข้าม ${data.filename || "-"} เพราะเป็นไฟล์ซ้ำ`
      : `นำเข้า ${data.filename || "-"} แล้ว: ${formatNumber(data.insertedIncomeEntries)} income entries${data.skippedIncomeEntries ? `, ข้าม ${formatNumber(data.skippedIncomeEntries)} รายการซ้ำ` : ""}`,
    productMaster: data.skippedReason === "duplicate_file_hash"
      ? `ข้าม ${data.filename || "-"} เพราะเป็นไฟล์ซ้ำ`
      : `นำเข้า ${data.filename || "-"} แล้ว: เพิ่ม ${formatNumber(data.insertedProductMasters)} / อัปเดต ${formatNumber(data.updatedProductMasters)} / ข้าม ${formatNumber(data.skippedProductMasters)}`,
  };

  statusNodes[kind].feedback.textContent = feedbackMap[kind];
}

function buildImportNotice(kind, data, counts, becameReady, options = {}) {
  const readiness = getReadiness(counts);
  const items = [];

  if (data.filename) {
    items.push(`<li><strong>ไฟล์:</strong> ${escapeHtml(data.filename)}</li>`);
  }

  if (data.period) {
    items.push(`<li><strong>งวดข้อมูล:</strong> ${escapeHtml(data.period)}</li>`);
  }

  if (kind === "orders") {
    items.push(
      `<li><strong>Orders:</strong> ${formatNumber(data.insertedOrderHeaders)}</li>`,
      `<li><strong>Order items:</strong> ${formatNumber(data.insertedOrderItems)}</li>`
    );
  }

  if (kind === "income") {
    items.push(
      `<li><strong>Income entries:</strong> ${formatNumber(data.insertedIncomeEntries)}</li>`,
      `<li><strong>Skipped:</strong> ${formatNumber(data.skippedIncomeEntries)}</li>`
    );
  }

  if (kind === "productMaster") {
    items.push(
      `<li><strong>เพิ่มใหม่:</strong> ${formatNumber(data.insertedProductMasters)}</li>`,
      `<li><strong>อัปเดต:</strong> ${formatNumber(data.updatedProductMasters)}</li>`,
      `<li><strong>ข้าม:</strong> ${formatNumber(data.skippedProductMasters)}</li>`,
      `<li><strong>Seller SKU ซ้ำ:</strong> ${formatNumber(data.duplicateSellerSkuCount)}</li>`
    );
  }

  if (options.healthUnavailable) {
    items.push("<li><strong>สถานะข้อมูล:</strong> อัปโหลดสำเร็จ แต่ตรวจสถานะรวมล่าสุดไม่ได้</li>");
  } else {
    items.push(
      `<li><strong>สถานะข้อมูล:</strong> ${
        readiness.isReady ? "พร้อมสร้างรายงานแล้ว" : "ยังอัปโหลดไม่ครบ"
      }</li>`
    );
  }

  if (!options.healthUnavailable && !readiness.hasProductMaster) {
    items.push("<li><strong>หมายเหตุ:</strong> ยังไม่มี Product Master ซึ่งไม่บังคับ แต่ช่วยให้การแมปสินค้าแม่นขึ้น</li>");
  }

  let title = "อัปโหลดสำเร็จ";
  let icon = "success";

  if (data.skippedReason === "duplicate_file_hash") {
    title = "ไฟล์นี้เคยนำเข้าแล้ว";
    icon = "info";
  } else if (becameReady) {
    title = "อัปโหลดครบ พร้อมดูรายงาน";
  } else if (kind === "productMaster") {
    title = "อัปเดต Product Master สำเร็จ";
  }

  return {
    icon,
    title,
    html: `<ul>${items.join("")}</ul>`,
  };
}

function getBatchTypeLabel(batchType) {
  return (
    {
      orders: "Orders",
      income: "Income",
      product_master: "Product Master",
    }[batchType] || batchType || "-"
  );
}

function buildDashboardItem({
  title,
  description,
  meta,
  actionHref,
  actionLabel,
  tone = "warn",
  extraHtml = "",
}) {
  return `
    <article class="todo-item" data-tone="${escapeHtml(tone)}">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description)}</p>
      ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
      ${extraHtml}
      ${
        actionHref && actionLabel
          ? `<a class="todo-item-action" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>`
          : ""
      }
    </article>
  `;
}

function renderTodayWorkflowDashboard({
  today,
  dailySummary,
  availableDates,
  batches,
  partialFailures = [],
}) {
  const warnings = Array.isArray(dailySummary?.warnings) ? dailySummary.warnings : [];
  const sourceStats = dailySummary?.sourceStats || {};
  const readiness = getReadiness(lastHealthCounts);
  const settledOrders = Number(
    sourceStats.settledOrders || dailySummary?.financeSummary?.settledOrders || 0
  );
  const coveragePercent = Number(sourceStats.coveragePercent || 0);
  const importsTodayCount = batches.filter((item) => isSameLocalDate(item.createdAt, today)).length;
  const latestSettlementDate = availableDates.length
    ? availableDates[availableDates.length - 1].date
    : "";
  const missingOrderItemOrders = Number(sourceStats.missingOrderItemOrders || 0);
  const unresolvedSellerSkuItemRows = Number(sourceStats.unresolvedSellerSkuItemRows || 0);

  todayReportLink.href = `/reports/daily?date=${encodeURIComponent(today)}`;
  todayReportLink.textContent = settledOrders > 0 ? "เปิดรายงานวันนี้" : "เปิดรายงานของวันนี้";

  todaySettledOrders.textContent = formatNumber(settledOrders);
  todayCoverage.textContent = formatPercent(coveragePercent);
  todayWarningCount.textContent = formatNumber(warnings.length);
  todayImportCount.textContent = formatNumber(importsTodayCount);

  if (settledOrders === 0) {
    setChipState(todayWorkflowBadge, "waiting", "รอ settlement วันนี้");
    todayWorkflowTitle.textContent = "วันนี้ยังไม่มีข้อมูล settlement ในระบบ";
    todayWorkflowCopy.textContent = latestSettlementDate
      ? `ข้อมูล settlement ล่าสุดของเดือนนี้คือ ${formatIsoDate(latestSettlementDate)} ถ้าวันนี้มีไฟล์ใหม่ ให้อัปโหลด Income ก่อนเปิดรายงาน`
      : "ยังไม่พบข้อมูล settlement ในเดือนนี้ ถ้ามีไฟล์ Income ของวันนี้ ให้อัปโหลดก่อนเพื่อเริ่มสรุปรายงาน";
  } else if (missingOrderItemOrders > 0 || warnings.length > 0) {
    setChipState(todayWorkflowBadge, "loading", "มีงานที่ต้องตรวจต่อ");
    todayWorkflowTitle.textContent = "วันนี้มีข้อมูลแล้ว แต่ยังควรเช็กก่อนปิดงาน";
    todayWorkflowCopy.textContent =
      `มี ${formatNumber(settledOrders)} ออเดอร์ที่ settle วันนี้ ` +
      `Coverage ${formatPercent(coveragePercent)} และ warning ${formatNumber(warnings.length)} กลุ่ม`;
  } else {
    setChipState(todayWorkflowBadge, "ready", "พร้อมเปิดรายงาน");
    todayWorkflowTitle.textContent = "งานวันนี้พร้อมเปิดรายงาน";
    todayWorkflowCopy.textContent =
      `วันนี้มี ${formatNumber(settledOrders)} ออเดอร์ที่ settle ` +
      `และจับคู่สินค้าได้ครบ Coverage ${formatPercent(coveragePercent)}`;
  }

  todayWorkflowSummary.textContent = partialFailures.length
    ? `โหลด dashboard ได้บางส่วน แต่ยังมีข้อมูลบางชุดที่ดึงไม่สำเร็จ: ${partialFailures.join(", ")}`
    : `สรุปจากวันที่ ${formatIsoDate(today)} เพื่อบอกว่าพร้อมเปิดรายงานแล้วหรือยัง และยังมีจุดไหนต้องตามต่อ`;

  const nextStepItems = [];

  if (!readiness.hasOrders) {
    nextStepItems.push(
      buildDashboardItem({
        title: "ยังไม่มีข้อมูล Orders ในระบบ",
        description: "อัปโหลดไฟล์ Order Export ก่อน เพื่อให้ระบบจับคู่สินค้าและจำนวนขายได้",
        actionHref: "#imports",
        actionLabel: "ไปอัปโหลด Orders",
      })
    );
  }

  if (settledOrders === 0) {
    nextStepItems.push(
      buildDashboardItem({
        title: "วันนี้ยังไม่มี Income / Settlement",
        description: "ถ้ามีไฟล์ของวันนี้ ให้อัปโหลด Income เพื่อให้รายงานรายวันเริ่มมีข้อมูล",
        meta: `วันที่ตรวจ: ${formatIsoDate(today)}`,
        actionHref: "#imports",
        actionLabel: "ไปอัปโหลด Income",
      })
    );
  }

  if (missingOrderItemOrders > 0) {
    nextStepItems.push(
      buildDashboardItem({
        title: "มีออเดอร์ที่ settle แล้ว แต่ยังไม่เจอรายการสินค้า",
        description: `พบ ${formatNumber(missingOrderItemOrders)} ออเดอร์ที่ยังไม่พบ item rows ในไฟล์ Orders`,
        meta: "ควรตามไฟล์ Order เพิ่มหรือเปิดรายงานเพื่อตรวจรายการที่ขาด",
        actionHref: `/reports/daily?date=${encodeURIComponent(today)}`,
        actionLabel: "เปิดรายงานวันนี้",
        tone: "error",
      })
    );
  }

  if (unresolvedSellerSkuItemRows > 0) {
    nextStepItems.push(
      buildDashboardItem({
        title: "มีสินค้าที่หา Seller SKU ไม่เจอ",
        description: `พบ ${formatNumber(unresolvedSellerSkuItemRows)} แถวที่ยังระบุ Seller SKU ไม่ได้`,
        meta: "อัปโหลด Product Master เพิ่มจะช่วยให้การแมปสินค้าแม่นขึ้น",
        actionHref: "#product-master",
        actionLabel: "ไปอัปโหลด Product Master",
      })
    );
  }

  if (!nextStepItems.length) {
    nextStepItems.push(
      buildDashboardItem({
        title: "ไม่มีงานค้างใน flow หลัก",
        description: "ข้อมูลหลักพร้อมแล้ว สามารถเปิดรายงานวันนี้หรือตรวจรายงานรายเดือนได้ทันที",
        actionHref: `/reports/daily?date=${encodeURIComponent(today)}`,
        actionLabel: "เปิดรายงานวันนี้",
        tone: "good",
      })
    );
  }

  todayNextSteps.innerHTML = nextStepItems.join("");

  if (warnings.length > 0) {
    todayWarningList.innerHTML = warnings
      .slice(0, 3)
      .map((warning) =>
        buildDashboardItem({
          title: warning.title || "พบ warning",
          description: warning.message || "มีข้อมูลบางส่วนที่ควรตรวจต่อ",
          meta: warning.details?.totalCount
            ? `รายละเอียด ${formatNumber(warning.details.totalCount)} รายการ`
            : "เปิดรายงานรายวันเพื่อดูรายละเอียด",
          actionHref: `/reports/daily?date=${encodeURIComponent(today)}`,
          actionLabel: "ดูในรายงานวันนี้",
          tone: warning.type === "missing_order_items" ? "error" : "warn",
        })
      )
      .join("");
  } else {
    todayWarningList.innerHTML = buildDashboardItem({
      title: settledOrders > 0 ? "วันนี้ยังไม่พบ warning สำคัญ" : "ยังไม่มี warning สำหรับวันนี้",
      description:
        settledOrders > 0
          ? "ถ้าต้องการตรวจซ้ำ สามารถเปิดรายงานวันนี้เพื่อดู summary รายละเอียดได้"
          : "เมื่อมี settlement เข้ามา ระบบจะสรุป warning ที่ต้องตามต่อให้ในส่วนนี้",
      actionHref: `/reports/daily?date=${encodeURIComponent(today)}`,
      actionLabel: "เปิดรายงานวันนี้",
      tone: "good",
    });
  }

  if (batches.length > 0) {
    recentImportList.innerHTML = batches
      .slice(0, 5)
      .map(
        (batch) => `
          <article class="import-log-item">
            <strong>${escapeHtml(batch.filename || "-")}</strong>
            <span>${escapeHtml(formatShortDate(batch.createdAt))}</span>
          </article>
        `
      )
      .join("");
  } else {
    recentImportList.innerHTML = '<p class="support-copy">ยังไม่มีประวัติการอัปโหลดในระบบ</p>';
  }
}

function setTodayWorkflowError(message) {
  setChipState(todayWorkflowBadge, "error", "โหลดงานวันนี้ไม่สำเร็จ");
  todayWorkflowTitle.textContent = "ยังสรุปงานวันนี้ไม่ได้";
  todayWorkflowCopy.textContent = message;
  todayWorkflowSummary.textContent = "ลองรีโหลดหน้าอีกครั้ง หรือเช็กการเชื่อมต่อระบบก่อนอัปโหลด";
  todaySettledOrders.textContent = "-";
  todayCoverage.textContent = "-";
  todayWarningCount.textContent = "-";
  todayImportCount.textContent = "-";
  todayNextSteps.innerHTML = `<p class="support-copy">${escapeHtml(message)}</p>`;
  todayWarningList.innerHTML = '<p class="support-copy">ยังโหลด warning ไม่ได้</p>';
  recentImportList.innerHTML = '<p class="support-copy">ยังโหลดประวัติการอัปโหลดไม่ได้</p>';
}

async function loadTodayWorkflowDashboard() {
  const today = getTodayIso();
  const month = today.slice(0, 7);

  setChipState(todayWorkflowBadge, "loading", "กำลังตรวจสอบงานวันนี้");
  todayWorkflowTitle.textContent = "กำลังโหลดข้อมูลของวันนี้...";
  todayWorkflowCopy.textContent = "ระบบกำลังสรุป settlement, warning, และประวัติการอัปโหลดล่าสุด";
  todayWorkflowSummary.textContent =
    "กำลังดึงข้อมูลจากรายงานรายวัน, ปฏิทิน และประวัติการนำเข้า";

  const [dailyResult, datesResult, batchesResult] = await Promise.allSettled([
    fetchJson(`/api/tiktok-settled-sales/daily-summary?date=${encodeURIComponent(today)}`),
    fetchJson(`/api/tiktok-settled-sales/available-dates?month=${encodeURIComponent(month)}`),
    fetchJson("/api/tiktok-settled-sales/batches"),
  ]);

  const partialFailures = [];
  const dailySummary = dailyResult.status === "fulfilled" ? dailyResult.value : null;
  const availableDates = datesResult.status === "fulfilled" ? datesResult.value.items || [] : [];
  const batches = batchesResult.status === "fulfilled" ? batchesResult.value.items || [] : [];

  if (dailyResult.status !== "fulfilled") {
    partialFailures.push("daily summary");
  }

  if (datesResult.status !== "fulfilled") {
    partialFailures.push("calendar");
  }

  if (batchesResult.status !== "fulfilled") {
    partialFailures.push("recent imports");
  }

  if (!dailySummary && !availableDates.length && !batches.length) {
    throw new Error("ไม่สามารถโหลด dashboard งานวันนี้ได้");
  }

  renderTodayWorkflowDashboard({
    today,
    dailySummary: dailySummary || {},
    availableDates,
    batches,
    partialFailures,
  });
}

function getCalendarMatrix(month) {
  const [year, rawMonth] = month.split("-");
  const firstDay = new Date(Number(year), Number(rawMonth) - 1, 1);
  const firstWeekday = firstDay.getDay();
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + index);

    const isoDate = [
      cellDate.getFullYear(),
      String(cellDate.getMonth() + 1).padStart(2, "0"),
      String(cellDate.getDate()).padStart(2, "0"),
    ].join("-");

    return {
      isoDate,
      dayNumber: cellDate.getDate(),
      isCurrentMonth: cellDate.getMonth() === Number(rawMonth) - 1,
      isToday: isoDate === getTodayIso(),
    };
  });
}

function renderCalendar(month) {
  calendarMonthLabel.textContent = formatMonthLabel(month);

  const cells = getCalendarMatrix(month);
  const dataDays = [...calendarDataByDate.values()];

  calendarSummary.textContent = dataDays.length > 0
    ? `เดือนนี้มีข้อมูลแล้ว ${formatNumber(dataDays.length)} วัน เลือกวันที่กรอบสีเขียวเพื่อเปิดรายงานรายวัน`
    : "เดือนนี้ยังไม่มีข้อมูลรายวันในระบบ";

  calendarGrid.innerHTML = cells
    .map((cell) => {
      const dayData = calendarDataByDate.get(cell.isoDate);
      const hasData = Boolean(dayData);
      const classNames = [
        "calendar-day",
        cell.isCurrentMonth ? "" : "is-outside",
        hasData ? "has-data" : "is-empty",
        cell.isToday ? "is-today" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const actionAttributes =
        hasData && cell.isCurrentMonth
          ? `type="button" data-date="${cell.isoDate}" aria-label="เปิดรายงานวันที่ ${cell.isoDate}"`
          : 'type="button" disabled aria-disabled="true"';

      const label = hasData ? "พร้อมรายงาน" : cell.isCurrentMonth ? "ไม่มีข้อมูล" : "";
      const meta = hasData
        ? `<strong>${formatNumber(dayData.incomeEntries)} รายการ</strong><span>${formatNumber(dayData.settledOrders)} ออเดอร์ที่ settle</span>`
        : `<span>${cell.isCurrentMonth ? "ยังไม่มี settlement ในวันนี้" : "อยู่นอกเดือนนี้"}</span>`;

      return `
        <button class="${classNames}" ${actionAttributes} role="gridcell">
          <div class="calendar-day-top">
            <span class="calendar-day-number">${cell.dayNumber}</span>
            ${label ? `<span class="calendar-day-label">${label}</span>` : ""}
          </div>
          <div class="calendar-day-meta">${meta}</div>
        </button>
      `;
    })
    .join("");
}

async function loadCalendar(month) {
  calendarMonth = month;
  setCalendarLoadingState("กำลังโหลดข้อมูลปฏิทิน...");
  calendarMonthLabel.textContent = formatMonthLabel(month);

  try {
    const payload = await fetchJson(
      `/api/tiktok-settled-sales/available-dates?month=${encodeURIComponent(month)}`
    );

    calendarDataByDate = new Map(
      (payload.items || []).map((item) => [item.date, item])
    );

    renderCalendar(payload.month || month);
    setCalendarIdleState(
      calendarDataByDate.size > 0
        ? "คลิกวันที่กรอบสีเขียวเพื่อเปิดรายงานรายวัน"
        : "เดือนนี้ยังไม่มีข้อมูล settlement ให้เปิดรายงาน"
    );
  } catch (error) {
    calendarDataByDate = new Map();
    renderCalendar(month);
    setCalendarIdleState(`โหลดข้อมูลปฏิทินไม่สำเร็จ: ${error.message}`);
  }
}

async function handleImportSubmit({ event, kind, url, busyLabel }) {
  event.preventDefault();
  const form = event.currentTarget;
  const previousReadiness = getReadiness(lastHealthCounts);

  setBusyState(form, true, busyLabel);

  try {
    const data = await postForm(url, form);
    renderJson(data);
    updateImportFeedback(kind, data);
    let counts = lastHealthCounts;
    let healthUnavailable = false;

    try {
      counts = await loadHealth();
    } catch (healthError) {
      healthUnavailable = true;
    }

    await Promise.allSettled([
      loadTodayWorkflowDashboard(),
      loadCalendar(calendarMonth || getCurrentMonthValue()),
    ]);

    resetFileInput(form);

    const nextReadiness = getReadiness(counts);

    await showNotice(
      buildImportNotice(
        kind,
        data,
        counts,
        !previousReadiness.isReady && nextReadiness.isReady,
        { healthUnavailable }
      )
    );
  } catch (error) {
    renderJson({ error: error.message });
    await showNotice({
      icon: "error",
      title: "อัปโหลดไม่สำเร็จ",
      html: `<p>${escapeHtml(error.message)}</p>`,
    });
  } finally {
    setBusyState(form, false, busyLabel);
  }
}

initDbButton.addEventListener("click", async () => {
  initDbButton.disabled = true;

  try {
    const response = await fetch("/api/tiktok-settled-sales/init-db", {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || payload.message || "Init failed");
    }

    renderJson(payload);
    await loadHealth();
    await Promise.allSettled([
      loadTodayWorkflowDashboard(),
      loadCalendar(calendarMonth || getCurrentMonthValue()),
    ]);
    await showNotice({
      icon: "success",
      title: "เตรียมฐานข้อมูลแล้ว",
      html: `<p>Collections ที่พร้อมใช้งาน: ${escapeHtml(payload.collections.join(", "))}</p>`,
    });
  } catch (error) {
    renderJson({ error: error.message });
    await showNotice({
      icon: "error",
      title: "เตรียมฐานข้อมูลไม่สำเร็จ",
      html: `<p>${escapeHtml(error.message)}</p>`,
    });
  } finally {
    initDbButton.disabled = false;
  }
});

productMasterImportForm.addEventListener("submit", (event) =>
  handleImportSubmit({
    event,
    kind: "productMaster",
    url: "/api/tiktok-settled-sales/import/product-master",
    busyLabel: "กำลังนำเข้า Product Master...",
  })
);

ordersImportForm.addEventListener("submit", (event) =>
  handleImportSubmit({
    event,
    kind: "orders",
    url: "/api/tiktok-settled-sales/import/orders",
    busyLabel: "กำลังนำเข้า Orders...",
  })
);

incomeImportForm.addEventListener("submit", (event) =>
  handleImportSubmit({
    event,
    kind: "income",
    url: "/api/tiktok-settled-sales/import/income",
    busyLabel: "กำลังนำเข้า Income...",
  })
);

dailyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const date = formData.get("date");

  try {
    const data = await fetchJson(
      `/api/tiktok-settled-sales/daily-summary?date=${encodeURIComponent(date)}`
    );
    renderJson(data);
  } catch (error) {
    renderJson({ error: error.message });
    await showNotice({
      icon: "error",
      title: "โหลดสรุปรายวันไม่สำเร็จ",
      html: `<p>${escapeHtml(error.message)}</p>`,
    });
  }
});

monthlyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const month = formData.get("month");

  try {
    const data = await fetchJson(
      `/api/tiktok-settled-sales/monthly-summary?month=${encodeURIComponent(month)}`
    );
    renderJson(data);
  } catch (error) {
    renderJson({ error: error.message });
    await showNotice({
      icon: "error",
      title: "โหลดสรุปรายเดือนไม่สำเร็จ",
      html: `<p>${escapeHtml(error.message)}</p>`,
    });
  }
});

calendarPrevButton.addEventListener("click", () => {
  loadCalendar(shiftMonth(calendarMonth || getCurrentMonthValue(), -1));
});

calendarNextButton.addEventListener("click", () => {
  loadCalendar(shiftMonth(calendarMonth || getCurrentMonthValue(), 1));
});

calendarTodayButton.addEventListener("click", () => {
  loadCalendar(getCurrentMonthValue());
});

calendarGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-date]");
  if (!button) {
    return;
  }

  const date = button.dataset.date;
  const dayData = calendarDataByDate.get(date);
  const result = await showConfirmNotice({
    title: "เปิดรายงานรายวัน",
    html: `
      <p>ต้องการเปิดรายงานของวันที่ <strong>${escapeHtml(date)}</strong> หรือไม่</p>
      <ul>
        <li><strong>Income entries:</strong> ${formatNumber(dayData?.incomeEntries)}</li>
        <li><strong>Settled orders:</strong> ${formatNumber(dayData?.settledOrders)}</li>
      </ul>
    `,
    confirmButtonText: "เปิดรายงาน",
  });

  if (result.isConfirmed) {
    window.location.href = `/reports/daily?date=${encodeURIComponent(date)}`;
  }
});

setDefaultPeriods();
loadHealth()
  .catch(() => undefined)
  .finally(() => {
    loadTodayWorkflowDashboard().catch((error) => {
      setTodayWorkflowError(`โหลด dashboard งานวันนี้ไม่สำเร็จ: ${error.message}`);
    });
  });
loadCalendar(getCurrentMonthValue());
