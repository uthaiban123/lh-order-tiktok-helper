const output = document.getElementById("output");
const healthStatus = document.getElementById("health-status");
const initDbButton = document.getElementById("init-db-button");
const productMasterImportForm = document.getElementById("product-master-import-form");
const ordersImportForm = document.getElementById("orders-import-form");
const incomeImportForm = document.getElementById("income-import-form");
const dailyForm = document.getElementById("daily-form");
const monthlyForm = document.getElementById("monthly-form");
const dailyDateInput = document.getElementById("daily-date");
const monthlyMonthInput = document.getElementById("monthly-month");

function renderJson(data) {
  output.textContent = JSON.stringify(data, null, 2);
}

function setDefaultPeriods() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  if (dailyDateInput && !dailyDateInput.value) {
    dailyDateInput.value = today;
  }

  if (monthlyMonthInput && !monthlyMonthInput.value) {
    monthlyMonthInput.value = month;
  }
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
    healthStatus.textContent = `เชื่อมต่อแล้ว batches=${data.counts.batches}, income=${data.counts.incomeEntries}, orderItems=${data.counts.orderItems}, productMasters=${data.counts.productMasters}`;
  } catch (error) {
    healthStatus.textContent = `ตรวจสอบระบบไม่สำเร็จ: ${error.message}`;
  }
}

initDbButton.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/tiktok-settled-sales/init-db", {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || payload.message || "Init failed");
    }
    renderJson(payload);
    loadHealth();
  } catch (error) {
    renderJson({ error: error.message });
  }
});

productMasterImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await postForm(
      "/api/tiktok-settled-sales/import/product-master",
      event.currentTarget
    );
    renderJson(data);
    loadHealth();
  } catch (error) {
    renderJson({ error: error.message });
  }
});

ordersImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await postForm(
      "/api/tiktok-settled-sales/import/orders",
      event.currentTarget
    );
    renderJson(data);
    loadHealth();
  } catch (error) {
    renderJson({ error: error.message });
  }
});

incomeImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await postForm(
      "/api/tiktok-settled-sales/import/income",
      event.currentTarget
    );
    renderJson(data);
    loadHealth();
  } catch (error) {
    renderJson({ error: error.message });
  }
});

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
  }
});

loadHealth();
setDefaultPeriods();
