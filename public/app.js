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

const numberFormatter = new Intl.NumberFormat("th-TH");
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

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentMonthValue() {
  return getTodayIso().slice(0, 7);
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
  const previousReadiness = getReadiness(lastHealthCounts);

  setBusyState(event.currentTarget, true, busyLabel);

  try {
    const data = await postForm(url, event.currentTarget);
    renderJson(data);
    updateImportFeedback(kind, data);
    let counts = lastHealthCounts;
    let healthUnavailable = false;

    try {
      counts = await loadHealth();
    } catch (healthError) {
      healthUnavailable = true;
    }

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
    setBusyState(event.currentTarget, false, busyLabel);
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
loadHealth().catch(() => undefined);
loadCalendar(getCurrentMonthValue());
