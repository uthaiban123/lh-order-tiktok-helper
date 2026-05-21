const importStatus = document.getElementById("import-status");
const pendingList = document.getElementById("pending-list");
const pendingPlatform = document.getElementById("pending-platform");
const pendingStatus = document.getElementById("pending-status");

/** @type {Map<string, { _id: string, label: string }>} */
const selectedTiktokByPending = new Map();
const productTableBody = document.getElementById("product-table-body");
const productPagination = document.getElementById("product-pagination");
const productSearch = document.getElementById("product-search");

let productPage = 1;
let productSearchTerm = "";
let loadedProducts = [];

const numberFormatter = new Intl.NumberFormat("th-TH");

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
      }[character])
  );
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "คำขอล้มเหลว");
  }
  return data;
}

async function loadStats() {
  const preview = await fetchJson("/api/price-sync/preview");
  document.getElementById("stat-tiktok").textContent = numberFormatter.format(
    preview.counts.tiktokExportRows
  );
  document.getElementById("stat-shopee").textContent = numberFormatter.format(
    preview.counts.shopeeLinked
  );
  document.getElementById("stat-lazada").textContent = numberFormatter.format(
    preview.counts.lazadaLinked
  );

  const [shopeePending, lazadaPending] = await Promise.all([
    fetchJson("/api/price-sync/pending?platform=shopee&status=open&limit=1"),
    fetchJson("/api/price-sync/pending?platform=lazada&status=open&limit=1"),
  ]);
  const pendingTotal =
    (shopeePending.pagination?.total || 0) + (lazadaPending.pagination?.total || 0);
  document.getElementById("stat-pending").textContent = numberFormatter.format(pendingTotal);
}

async function uploadCatalog(platform) {
  const input = document.querySelector(`input[data-import="${platform}"]`);
  if (!input?.files?.[0]) {
    Swal.fire({ icon: "warning", title: "เลือกไฟล์ก่อน", confirmButtonColor: "#0f5b5c" });
    return;
  }

  const formData = new FormData();
  formData.append("file", input.files[0]);
  importStatus.textContent = `กำลังอัปโหลด ${platform}...`;

  const result = await fetchJson(`/api/price-sync/import/${platform}`, {
    method: "POST",
    body: formData,
  });

  importStatus.textContent = JSON.stringify(result, null, 2);
  input.value = "";
  await Promise.all([loadStats(), loadPending(), loadProducts()]);
  Swal.fire({
    icon: "success",
    title: "อัปโหลดสำเร็จ",
    text: platform,
    confirmButtonColor: "#0f5b5c",
  });
}

function linkBadge(status) {
  const value = status || "unlinked";
  const cls = value === "linked" || value === "manual" || value === "native" ? "linked" : "unlinked";
  return `<span class="link-badge ${cls}">${escapeHtml(value)}</span>`;
}

function formatTiktokLabel(item) {
  const parts = [
    item.productName,
    item.variationValue ? `(${item.variationValue})` : "",
    item.sellerSku ? `[${item.sellerSku}]` : "",
    `SKU ${item.skuId}`,
  ].filter(Boolean);
  return parts.join(" ");
}

async function searchTiktokPicklist(query) {
  const params = new URLSearchParams({ limit: "15" });
  if (query.trim()) params.set("search", query.trim());
  const data = await fetchJson(`/api/price-sync/tiktok-picklist?${params.toString()}`);
  return data.items || [];
}

function renderPickResults(pendingId, items, selectedId) {
  const container = document.querySelector(`[data-pick-results="${pendingId}"]`);
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '<span class="pending-meta">ไม่พบสินค้า TikTok</span>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const selected = String(item._id) === String(selectedId);
      return `
        <button
          type="button"
          class="tiktok-pick-option${selected ? " is-selected" : ""}"
          data-pick-select="${escapeHtml(pendingId)}"
          data-master-id="${escapeHtml(item._id)}"
          data-label="${escapeHtml(formatTiktokLabel(item))}"
        >
          ${escapeHtml(formatTiktokLabel(item))}
        </button>
      `;
    })
    .join("");
}

function updateSelectedDisplay(pendingId) {
  const selected = selectedTiktokByPending.get(pendingId);
  const el = document.querySelector(`[data-pick-selected="${pendingId}"]`);
  const confirmBtn = document.querySelector(`[data-confirm-pick="${pendingId}"]`);
  if (!el) return;

  if (selected) {
    el.textContent = `เลือกแล้ว: ${selected.label}`;
    if (confirmBtn) confirmBtn.disabled = false;
  } else {
    el.textContent = "ยังไม่ได้เลือกสินค้า TikTok";
    if (confirmBtn) confirmBtn.disabled = true;
  }
}

async function loadPending() {
  const platform = pendingPlatform.value;
  const status = pendingStatus.value;
  pendingList.innerHTML = '<p class="support-copy">กำลังโหลด...</p>';

  try {
    const data = await fetchJson(
      `/api/price-sync/pending?platform=${encodeURIComponent(platform)}&status=${encodeURIComponent(status)}&limit=30`
    );

    if (!data.items.length) {
      pendingList.innerHTML = '<p class="support-copy">ไม่มีรายการรอยืนยัน</p>';
      return;
    }

    pendingList.innerHTML = data.items
      .map((item) => {
        const pendingId = String(item._id);
        const suggestion = item.suggestion;
        const suggestionText = suggestion
          ? `${escapeHtml(suggestion.productName)} / ${escapeHtml(suggestion.variationValue || "-")} (SKU: ${escapeHtml(suggestion.skuId)}) — คะแนน ${item.matchScore}`
          : "ไม่มีคำแนะนำ";

        if (suggestion?.skuId && !selectedTiktokByPending.has(pendingId)) {
          selectedTiktokByPending.set(pendingId, {
            _id: String(item.suggestedProductMasterId),
            label: formatTiktokLabel(suggestion),
          });
        }

        const defaultSearch = [item.productName, item.variationName].filter(Boolean).join(" ");

        return `
          <article class="pending-item" data-pending-id="${escapeHtml(pendingId)}">
            <div class="pending-item-top">
              <div>
                <strong>${escapeHtml(item.productName)}</strong>
                <span class="pending-meta">${escapeHtml(item.variationName || "")} · ${escapeHtml(platform)}</span>
                <p class="pending-meta">แนะนำ: ${suggestionText}</p>
              </div>
              <div class="pending-actions">
                <button type="button" class="primary-button" data-confirm="${escapeHtml(pendingId)}" data-master="${escapeHtml(item.suggestedProductMasterId || "")}" ${!item.suggestedProductMasterId ? "disabled" : ""}>ยืนยันคำแนะนำ</button>
                <button type="button" class="secondary-button" data-skip="${escapeHtml(pendingId)}">ข้าม</button>
              </div>
            </div>
            <div class="tiktok-picker">
              <span class="tiktok-picker-label">เลือกสินค้า TikTok เอง</span>
              <div class="tiktok-picker-row">
                <input
                  type="search"
                  placeholder="ค้นหา skuId, sellerSku, ชื่อสินค้า..."
                  value="${escapeHtml(defaultSearch)}"
                  data-pick-search="${escapeHtml(pendingId)}"
                />
                <button type="button" class="secondary-button" data-pick-search-btn="${escapeHtml(pendingId)}">ค้นหา</button>
              </div>
              <div class="tiktok-pick-results" data-pick-results="${escapeHtml(pendingId)}"></div>
              <div class="tiktok-pick-selected" data-pick-selected="${escapeHtml(pendingId)}">ยังไม่ได้เลือกสินค้า TikTok</div>
              <button type="button" class="primary-button" data-confirm-pick="${escapeHtml(pendingId)}" disabled>ยืนยันที่เลือก</button>
            </div>
          </article>
        `;
      })
      .join("");

    for (const item of data.items) {
      const pendingId = String(item._id);
      updateSelectedDisplay(pendingId);
      const input = document.querySelector(`[data-pick-search="${pendingId}"]`);
      const query = input?.value || item.productName || "";
      searchTiktokPicklist(query)
        .then((items) => {
          const selected = selectedTiktokByPending.get(pendingId);
          renderPickResults(pendingId, items, selected?._id);
        })
        .catch(() => {});
    }
  } catch (error) {
    pendingList.innerHTML = `<p class="support-copy">${escapeHtml(error.message)}</p>`;
  }
}

async function confirmPending(pendingId, productMasterId) {
  await fetchJson("/api/price-sync/mappings/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingId, productMasterId, matchedBy: "manual" }),
  });
  selectedTiktokByPending.delete(pendingId);
  await Promise.all([loadPending(), loadStats(), loadProducts()]);
}

async function skipPendingItem(pendingId) {
  await fetchJson("/api/price-sync/mappings/skip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingId }),
  });
  await loadPending();
}

async function loadProducts() {
  productTableBody.innerHTML =
    '<tr><td colspan="6" class="empty-state">กำลังโหลด...</td></tr>';

  const params = new URLSearchParams({
    page: String(productPage),
    limit: "20",
  });
  if (productSearchTerm) params.set("search", productSearchTerm);

  const data = await fetchJson(`/api/price-sync/products?${params.toString()}`);
  loadedProducts = data.items;
  renderProducts(data.items);
  renderPagination(data.pagination);
}

function renderProducts(items) {
  if (!items.length) {
    productTableBody.innerHTML =
      '<tr><td colspan="6" class="empty-state">ไม่พบสินค้า — อัปโหลด TikTok ก่อน</td></tr>';
    return;
  }

  productTableBody.innerHTML = items
    .map((item) => {
      const canonical = item.canonicalPrice || item.price || 0;
      const shopeeStatus = item.platforms?.shopee?.linkStatus || "unlinked";
      const lazadaStatus = item.platforms?.lazada?.linkStatus || "unlinked";

      return `
        <tr data-sku-id="${escapeHtml(item.skuId)}">
          <td>${escapeHtml(item.skuId)}<br><small>${escapeHtml(item.sellerSku || "")}</small></td>
          <td>${escapeHtml(item.productName)}<br><small>${escapeHtml(item.variationValue || "")}</small></td>
          <td>
            <input class="price-input" type="number" min="0" step="0.01" value="${canonical}" data-price-input="${escapeHtml(item.skuId)}" />
          </td>
          <td>${linkBadge(shopeeStatus)}</td>
          <td>${linkBadge(lazadaStatus)}</td>
          <td><button type="button" class="secondary-button" data-save-price="${escapeHtml(item.skuId)}">บันทึก</button></td>
        </tr>
      `;
    })
    .join("");
}

function renderPagination(pagination) {
  if (!pagination || pagination.totalPages <= 1) {
    productPagination.innerHTML = "";
    return;
  }
  productPagination.innerHTML = `
    <button type="button" class="secondary-button" data-page="${pagination.page - 1}" ${pagination.page <= 1 ? "disabled" : ""}>ก่อนหน้า</button>
    <span>หน้า ${pagination.page} / ${pagination.totalPages}</span>
    <button type="button" class="secondary-button" data-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>ถัดไป</button>
  `;
}

async function savePrice(skuId) {
  const input = document.querySelector(`input[data-price-input="${skuId}"]`);
  const canonicalPrice = Number(input?.value || 0);
  await fetchJson(`/api/price-sync/products/${encodeURIComponent(skuId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ canonicalPrice }),
  });
  Swal.fire({ icon: "success", title: "บันทึกแล้ว", timer: 1200, showConfirmButton: false });
  await loadStats();
}

async function applyBulkPercent() {
  const percent = Number(document.getElementById("bulk-percent").value);
  if (Number.isNaN(percent)) {
    Swal.fire({ icon: "warning", title: "ใส่ % ให้ถูกต้อง", confirmButtonColor: "#0f5b5c" });
    return;
  }

  const items = loadedProducts.map((item) => ({
    skuId: item.skuId,
    percent,
  }));

  const result = await fetchJson("/api/price-sync/bulk", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "percent", items }),
  });

  Swal.fire({
    icon: "success",
    title: `ปรับราคา ${result.updated} รายการ`,
    confirmButtonColor: "#0f5b5c",
  });
  await loadProducts();
  await loadStats();
}

document.querySelectorAll("[data-upload]").forEach((button) => {
  button.addEventListener("click", () => {
    uploadCatalog(button.dataset.upload).catch((error) => {
      Swal.fire({ icon: "error", title: "ผิดพลาด", text: error.message, confirmButtonColor: "#0f5b5c" });
    });
  });
});

document.getElementById("refresh-pending").addEventListener("click", () => loadPending());
document.getElementById("resuggest-pending").addEventListener("click", () => {
  fetchJson("/api/price-sync/mappings/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: pendingPlatform.value }),
  })
    .then(() => loadPending())
    .catch((error) =>
      Swal.fire({ icon: "error", title: "ผิดพลาด", text: error.message, confirmButtonColor: "#0f5b5c" })
    );
});

pendingPlatform.addEventListener("change", () => loadPending());
pendingStatus.addEventListener("change", () => loadPending());

pendingList.addEventListener("click", (event) => {
  const confirmBtn = event.target.closest("[data-confirm]");
  const confirmPickBtn = event.target.closest("[data-confirm-pick]");
  const skipBtn = event.target.closest("[data-skip]");
  const searchBtn = event.target.closest("[data-pick-search-btn]");
  const pickOption = event.target.closest("[data-pick-select]");

  if (pickOption) {
    const pendingId = pickOption.dataset.pickSelect;
    selectedTiktokByPending.set(pendingId, {
      _id: pickOption.dataset.masterId,
      label: pickOption.dataset.label,
    });
    pickOption.parentElement.querySelectorAll(".tiktok-pick-option").forEach((el) => {
      el.classList.remove("is-selected");
    });
    pickOption.classList.add("is-selected");
    updateSelectedDisplay(pendingId);
    return;
  }

  if (searchBtn) {
    const pendingId = searchBtn.dataset.pickSearchBtn;
    const input = document.querySelector(`[data-pick-search="${pendingId}"]`);
    searchTiktokPicklist(input?.value || "")
      .then((items) => {
        const selected = selectedTiktokByPending.get(pendingId);
        renderPickResults(pendingId, items, selected?._id);
      })
      .catch((error) =>
        Swal.fire({ icon: "error", title: "ผิดพลาด", text: error.message, confirmButtonColor: "#0f5b5c" })
      );
    return;
  }

  if (confirmBtn) {
    const pendingId = confirmBtn.dataset.confirm;
    const productMasterId = confirmBtn.dataset.master;
    if (!productMasterId) return;
    confirmPending(pendingId, productMasterId).catch((error) =>
      Swal.fire({ icon: "error", title: "ผิดพลาด", text: error.message, confirmButtonColor: "#0f5b5c" })
    );
  }

  if (confirmPickBtn) {
    const pendingId = confirmPickBtn.dataset.confirmPick;
    const selected = selectedTiktokByPending.get(pendingId);
    if (!selected?._id) return;
    confirmPending(pendingId, selected._id).catch((error) =>
      Swal.fire({ icon: "error", title: "ผิดพลาด", text: error.message, confirmButtonColor: "#0f5b5c" })
    );
  }

  if (skipBtn) {
    skipPendingItem(skipBtn.dataset.skip).catch((error) =>
      Swal.fire({ icon: "error", title: "ผิดพลาด", text: error.message, confirmButtonColor: "#0f5b5c" })
    );
  }
});

pendingList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const input = event.target.closest("[data-pick-search]");
  if (!input) return;
  event.preventDefault();
  const pendingId = input.dataset.pickSearch;
  searchTiktokPicklist(input.value)
    .then((items) => {
      const selected = selectedTiktokByPending.get(pendingId);
      renderPickResults(pendingId, items, selected?._id);
    })
    .catch((error) =>
      Swal.fire({ icon: "error", title: "ผิดพลาด", text: error.message, confirmButtonColor: "#0f5b5c" })
    );
});

productTableBody.addEventListener("click", (event) => {
  const saveBtn = event.target.closest("[data-save-price]");
  if (saveBtn) {
    savePrice(saveBtn.dataset.savePrice).catch((error) =>
      Swal.fire({ icon: "error", title: "ผิดพลาด", text: error.message, confirmButtonColor: "#0f5b5c" })
    );
  }
});

productPagination.addEventListener("click", (event) => {
  const pageBtn = event.target.closest("[data-page]");
  if (!pageBtn || pageBtn.disabled) return;
  productPage = Number(pageBtn.dataset.page);
  loadProducts();
});

document.getElementById("product-search-btn").addEventListener("click", () => {
  productSearchTerm = productSearch.value.trim();
  productPage = 1;
  loadProducts();
});

document.getElementById("bulk-percent-btn").addEventListener("click", () => {
  applyBulkPercent().catch((error) =>
    Swal.fire({ icon: "error", title: "ผิดพลาด", text: error.message, confirmButtonColor: "#0f5b5c" })
  );
});

Promise.all([loadStats(), loadPending(), loadProducts()]).catch((error) => {
  console.error(error);
});
