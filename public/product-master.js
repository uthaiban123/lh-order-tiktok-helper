const tableBody = document.getElementById("product-table-body");
const pagination = document.getElementById("pagination");
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");
const clearSearchButton = document.getElementById("clear-search-button");
const totalBadge = document.getElementById("total-badge");
const openCreateButton = document.getElementById("open-create-button");
const dialog = document.getElementById("product-dialog");
const dialogTitle = document.getElementById("dialog-title");
const productForm = document.getElementById("product-form");
const dialogClose = document.getElementById("dialog-close");
const dialogCancel = document.getElementById("dialog-cancel");

let currentPage = 1;
let currentSearch = "";
let currentLimit = 20;

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

async function loadProducts() {
  tableBody.innerHTML =
    '<tr><td colspan="8" class="empty-state">กำลังโหลดข้อมูล...</td></tr>';
  pagination.innerHTML = "";

  try {
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("limit", String(currentLimit));
    if (currentSearch) params.set("search", currentSearch);

    const response = await fetch(`/api/product-master?${params.toString()}`);
    if (!response.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
    const data = await response.json();

    totalBadge.textContent = `${numberFormatter.format(data.pagination.total)} รายการ`;
    renderTable(data.items);
    renderPagination(data.pagination);
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="8" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
    Swal.fire({
      icon: "error",
      title: "ผิดพลาด",
      text: error.message,
      confirmButtonColor: "#0f5b5c",
    });
  }
}

function renderTable(items) {
  if (!items || items.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="8" class="empty-state">ไม่พบรายการสินค้า</td></tr>';
    return;
  }

  tableBody.innerHTML = items
    .map((item) => {
      const baseCode =
        item.baseProductCode || item.computedBaseProductCode || "-";
      const multiplier =
        item.packMultiplier || item.computedPackMultiplier || 1;
      const sellerSkuDisplay = item.manualSellerSkuEnabled
        ? `${escapeHtml(item.manualSellerSku)} <span class="badge">manual</span>`
        : escapeHtml(item.sellerSku || "");

      return `
        <tr data-id="${escapeHtml(item._id)}">
          <td>${escapeHtml(item.productId)}</td>
          <td>${escapeHtml(item.skuId)}</td>
          <td>${sellerSkuDisplay}</td>
          <td>${escapeHtml(item.productName)}</td>
          <td><code>${escapeHtml(baseCode)}</code></td>
          <td>${numberFormatter.format(multiplier)}</td>
          <td>${escapeHtml(item.category || "-")}</td>
          <td>
            <div class="row-actions">
              <button type="button" class="action-button edit-button" data-action="edit">แก้ไข</button>
              <button type="button" class="action-button delete-button" data-action="delete">ลบ</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  tableBody.querySelectorAll("button[data-action='edit']").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest("tr").dataset.id;
      openEdit(id);
    });
  });

  tableBody
    .querySelectorAll("button[data-action='delete']")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.closest("tr").dataset.id;
        confirmDelete(id);
      });
    });
}

function renderPagination(paginationData) {
  const { page, totalPages } = paginationData;
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }

  if (page > 1) {
    pages.push(`<button type="button" class="page-button" data-page="${page - 1}">← ก่อนหน้า</button>`);
  }
  for (let i = start; i <= end; i++) {
    const activeClass = i === page ? "active" : "";
    pages.push(`<button type="button" class="page-button ${activeClass}" data-page="${i}">${i}</button>`);
  }
  if (page < totalPages) {
    pages.push(`<button type="button" class="page-button" data-page="${page + 1}">ถัดไป →</button>`);
  }

  pagination.innerHTML = pages.join("");
  pagination.querySelectorAll(".page-button").forEach((button) => {
    button.addEventListener("click", () => {
      currentPage = Number(button.dataset.page);
      loadProducts();
    });
  });
}

function openCreate() {
  dialogTitle.textContent = "เพิ่มสินค้าใหม่";
  document.getElementById("product-id").value = "";
  productForm.reset();
  document.getElementById("form-pack-multiplier").value = "1";
  document.getElementById("form-price").value = "0";
  document.getElementById("form-quantity").value = "0";
  dialog.showModal();
}

async function openEdit(id) {
  try {
    const response = await fetch(`/api/product-master/${id}`);
    if (!response.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
    const item = await response.json();

    dialogTitle.textContent = "แก้ไขสินค้า";
    document.getElementById("product-id").value = item._id;
    document.getElementById("form-product-id").value = item.productId;
    document.getElementById("form-sku-id").value = item.skuId;
    document.getElementById("form-seller-sku").value = item.sellerSku || "";
    document.getElementById("form-manual-seller-sku").value =
      item.manualSellerSku || "";
    document.getElementById("form-manual-seller-sku-enabled").checked =
      item.manualSellerSkuEnabled || false;
    document.getElementById("form-product-name").value = item.productName;
    document.getElementById("form-variation").value =
      item.variationValue || "";
    document.getElementById("form-category").value = item.category || "";
    document.getElementById("form-brand").value = item.brand || "";
    document.getElementById("form-base-code").value =
      item.baseProductCode || "";
    document.getElementById("form-pack-multiplier").value =
      item.packMultiplier || 1;
    document.getElementById("form-price").value = item.price || 0;
    document.getElementById("form-quantity").value = item.quantity || 0;
    dialog.showModal();
  } catch (error) {
    Swal.fire({
      icon: "error",
      title: "ผิดพลาด",
      text: error.message,
      confirmButtonColor: "#0f5b5c",
    });
  }
}

async function confirmDelete(id) {
  const result = await Swal.fire({
    icon: "warning",
    title: "ยืนยันการลบ",
    text: "ลบรายการสินค้านี้? การกระทำนี้ไม่สามารถย้อนกลับได้",
    showCancelButton: true,
    confirmButtonText: "ลบ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#c0392b",
    cancelButtonColor: "#6b7280",
  });
  if (!result.isConfirmed) return;

  try {
    const response = await fetch(`/api/product-master/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "ลบไม่สำเร็จ");
    }
    Swal.fire({
      icon: "success",
      title: "ลบสำเร็จ",
      timer: 1200,
      showConfirmButton: false,
    });
    loadProducts();
  } catch (error) {
    Swal.fire({
      icon: "error",
      title: "ผิดพลาด",
      text: error.message,
      confirmButtonColor: "#0f5b5c",
    });
  }
}

async function handleSave(event) {
  event.preventDefault();
  const id = document.getElementById("product-id").value;
  const payload = {
    productId: document.getElementById("form-product-id").value.trim(),
    skuId: document.getElementById("form-sku-id").value.trim(),
    sellerSku: document.getElementById("form-seller-sku").value.trim(),
    manualSellerSku: document.getElementById("form-manual-seller-sku").value.trim(),
    manualSellerSkuEnabled: document.getElementById("form-manual-seller-sku-enabled").checked,
    productName: document.getElementById("form-product-name").value.trim(),
    variationValue: document.getElementById("form-variation").value.trim(),
    category: document.getElementById("form-category").value.trim(),
    brand: document.getElementById("form-brand").value.trim(),
    baseProductCode: document.getElementById("form-base-code").value.trim(),
    packMultiplier: Number(document.getElementById("form-pack-multiplier").value) || 1,
    price: Number(document.getElementById("form-price").value) || 0,
    quantity: Number(document.getElementById("form-quantity").value) || 0,
  };

  try {
    const url = id ? `/api/product-master/${id}` : `/api/product-master`;
    const method = id ? "PUT" : "POST";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "บันทึกไม่สำเร็จ");
    }

    dialog.close();
    Swal.fire({
      icon: "success",
      title: "บันทึกสำเร็จ",
      timer: 1200,
      showConfirmButton: false,
    });
    loadProducts();
  } catch (error) {
    Swal.fire({
      icon: "error",
      title: "ผิดพลาด",
      text: error.message,
      confirmButtonColor: "#0f5b5c",
    });
  }
}

openCreateButton.addEventListener("click", openCreate);
searchButton.addEventListener("click", () => {
  currentPage = 1;
  currentSearch = searchInput.value.trim();
  loadProducts();
});
clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  currentPage = 1;
  currentSearch = "";
  loadProducts();
});
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    currentPage = 1;
    currentSearch = searchInput.value.trim();
    loadProducts();
  }
});
productForm.addEventListener("submit", handleSave);
dialogClose.addEventListener("click", () => dialog.close());
dialogCancel.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

document.addEventListener("DOMContentLoaded", () => {
  loadProducts();
});
