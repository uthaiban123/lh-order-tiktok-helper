document.querySelector("[data-menu-toggle]")?.addEventListener("click", () => {
  document.body.classList.toggle("sidebar-open");
});

document.querySelectorAll(".side-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.body.classList.remove("sidebar-open");
  });
});

document.addEventListener("click", (event) => {
  if (
    document.body.classList.contains("sidebar-open") &&
    !event.target.closest(".sidebar") &&
    !event.target.closest("[data-menu-toggle]")
  ) {
    document.body.classList.remove("sidebar-open");
  }
});

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}
