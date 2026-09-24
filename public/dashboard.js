const API = "/api/tiktok-settled-sales";
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const numberFormat = new Intl.NumberFormat("th-TH");
const moneyFormat = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percentFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 });
const dateTimeFormat = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const $ = (id) => document.getElementById(id);
let calendarMonth = "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function todayIso() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateTimeFormat.format(date);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Request failed");
  }
  return payload;
}

function listItem(label, value = "", tone = "") {
  return `<li class="${tone}"><span class="label">${escapeHtml(label)}</span>${
    value ? `<span class="value">${escapeHtml(value)}</span>` : ""
  }</li>`;
}

function notify(icon, title, text) {
  if (window.Swal) {
    return window.Swal.fire({ icon, title, text, confirmButtonText: "รับทราบ" });
  }
  window.alert(`${title}\n${text}`);
  return Promise.resolve();
}

async function loadSync() {
  const dot = $("sync-dot");
  const text = $("sync-text");
  try {
    const status = await fetchJson(`${API}/order-sync/status`);
    $("kpi-new-orders").textContent = numberFormat.format(status.ordersCreatedToday || 0);

    if (!status.enabled) {
      dot.dataset.state = "loading";
      text.textContent = "ยังไม่ได้ตั้งค่า TikTok API · ใช้การนำเข้าไฟล์แทน";
      $("sync-button").hidden = true;
      return;
    }

    if (status.lastError) {
      dot.dataset.state = "error";
      text.textContent = `ดึงคำสั่งซื้อล่าสุดไม่สำเร็จ: ${status.lastError}`;
      return;
    }

    dot.dataset.state = status.running ? "loading" : "ready";
    text.textContent = status.running
      ? "กำลังดึงคำสั่งซื้อ..."
      : `ดึงคำสั่งซื้ออัตโนมัติทุก 1 ชม. · ล่าสุด ${
          status.lastSuccessAt ? formatDateTime(status.lastSuccessAt) : "ยังไม่เคยดึง"
        }`;
  } catch (error) {
    dot.dataset.state = "error";
    text.textContent = `ตรวจสถานะการดึงไม่สำเร็จ: ${error.message}`;
  }
}

function renderChecks(summary, today) {
  const stats = summary?.sourceStats || {};
  const warnings = Array.isArray(summary?.warnings) ? summary.warnings : [];
  const settled = Number(stats.settledOrders || 0);
  const items = [];

  if (settled === 0) {
    items.push(listItem("ยังไม่มีข้อมูล Income ของวันนี้", "นำเข้าไฟล์", "warn"));
  }

  for (const warning of warnings.slice(0, 4)) {
    const count = warning.details?.totalCount;
    items.push(
      listItem(
        warning.title || warning.message || "พบรายการที่ควรตรวจ",
        count ? `${numberFormat.format(count)} รายการ` : "",
        warning.type === "missing_order_items" ? "error" : "warn"
      )
    );
  }

  if (warnings.length > 4) {
    items.push(listItem(`และอีก ${warnings.length - 4} รายการในรายงาน`, "", "warn"));
  }

  if (items.length === 0) {
    items.push(listItem("ไม่มีรายการค้าง พร้อมเปิดรายงาน", "", "good"));
  }

  $("check-list").innerHTML = items.join("");
  $("today-report-link").href = `/reports/daily?date=${encodeURIComponent(today)}`;
}

async function loadToday() {
  const today = todayIso();
  try {
    const summary = await fetchJson(`${API}/daily-summary?date=${encodeURIComponent(today)}`);
    const stats = summary.sourceStats || {};
    $("kpi-settled").textContent = numberFormat.format(stats.settledOrders || 0);
    $("kpi-amount").textContent = moneyFormat.format(
      summary.financeSummary?.totalSettlementAmount || 0
    );
    $("kpi-coverage").textContent = stats.settledOrders
      ? `${percentFormat.format(stats.coveragePercent || 0)}%`
      : "-";
    renderChecks(summary, today);
  } catch (error) {
    $("check-list").innerHTML = listItem(`โหลดสรุปวันนี้ไม่สำเร็จ: ${error.message}`, "", "error");
  }
}

async function loadImports() {
  const labels = { orders: "Orders", income: "Income", product_master: "Product Master" };
  try {
    const { items = [] } = await fetchJson(`${API}/batches`);
    $("import-list").innerHTML = items.length
      ? items
          .slice(0, 8)
          .map((batch) =>
            listItem(
              `${labels[batch.batchType] || batch.batchType} · ${batch.filename || "-"}`,
              formatDateTime(batch.createdAt)
            )
          )
          .join("")
      : '<li class="muted">ยังไม่มีการนำเข้า</li>';
  } catch (error) {
    $("import-list").innerHTML = listItem(`โหลดประวัติไม่สำเร็จ: ${error.message}`, "", "error");
  }
}

function openImportsDialog() {
  const dialog = $("imports-dialog");
  if (!dialog) {
    return;
  }
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeImportsDialog() {
  const dialog = $("imports-dialog");
  if (!dialog) {
    return;
  }
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

async function loadCalendar(month) {
  calendarMonth = month;
  const [year, monthNumber] = month.split("-").map(Number);
  $("calendar-label").textContent = `${THAI_MONTHS[monthNumber - 1]} ${year}`;

  let dataByDate = new Map();
  try {
    const { items = [] } = await fetchJson(
      `${API}/available-dates?month=${encodeURIComponent(month)}`
    );
    dataByDate = new Map(items.map((item) => [item.date, item]));
  } catch (error) {
    dataByDate = new Map();
  }

  const first = new Date(year, monthNumber - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const today = todayIso();

  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    const inMonth = date.getMonth() === monthNumber - 1;
    const day = dataByDate.get(iso);
    const classes = [
      inMonth ? "" : "outside",
      day && inMonth ? "has-data" : "",
      iso === today ? "today" : "",
    ].filter(Boolean).join(" ");
    return day && inMonth
      ? `<button type="button" class="${classes}" data-date="${iso}">${date.getDate()}</button>`
      : `<button type="button" class="${classes}" disabled>${date.getDate()}</button>`;
  });

  $("calendar").innerHTML =
    WEEKDAYS.map((name) => `<span class="weekday">${name}</span>`).join("") + cells.join("");
}

async function loadSystem() {
  try {
    const { counts } = await fetchJson(`${API}/health`);
    $("system-text").textContent =
      `ระบบพร้อม · คำสั่งซื้อ ${numberFormat.format(counts.orderItems)} แถว · ` +
      `Income ${numberFormat.format(counts.incomeEntries)} รายการ · ` +
      `Product Master ${numberFormat.format(counts.productMasters)} SKU`;
  } catch (error) {
    $("system-text").textContent = `เชื่อมต่อระบบไม่สำเร็จ: ${error.message}`;
  }
}

$("sync-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  $("sync-text").textContent = "กำลังดึงคำสั่งซื้อ...";
  try {
    const result = await fetchJson(`${API}/order-sync/run`, { method: "POST" });
    await Promise.all([loadSync(), loadSystem()]);
    if (!result.skipped) {
      await notify("success", "ดึงคำสั่งซื้อแล้ว", `อัปเดต ${numberFormat.format(result.upserted)} ออเดอร์`);
    }
  } catch (error) {
    await loadSync();
    await notify("error", "ดึงคำสั่งซื้อไม่สำเร็จ", error.message);
  } finally {
    button.disabled = false;
  }
});

$("init-db-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const payload = await fetchJson(`${API}/init-db`, { method: "POST" });
    await loadSystem();
    await notify("success", "เตรียมฐานข้อมูลแล้ว", `${payload.collections.length} collections พร้อมใช้งาน`);
  } catch (error) {
    await notify("error", "เตรียมฐานข้อมูลไม่สำเร็จ", error.message);
  } finally {
    button.disabled = false;
  }
});

$("imports-history-button").addEventListener("click", async () => {
  await loadImports();
  openImportsDialog();
});

$("imports-dialog-close").addEventListener("click", () => {
  closeImportsDialog();
});

$("imports-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    closeImportsDialog();
  }
});

$("calendar-prev").addEventListener("click", () => loadCalendar(shiftMonth(calendarMonth, -1)));
$("calendar-next").addEventListener("click", () => loadCalendar(shiftMonth(calendarMonth, 1)));
$("calendar").addEventListener("click", (event) => {
  const button = event.target.closest("[data-date]");
  if (button) {
    window.location.href = `/reports/daily?date=${encodeURIComponent(button.dataset.date)}`;
  }
});

loadSync();
loadToday();
loadSystem();
loadCalendar(todayIso().slice(0, 7));
