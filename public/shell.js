document.querySelector("[data-menu-toggle]")?.addEventListener("click", () => {
  document.body.classList.toggle("sidebar-open");
});

document.querySelectorAll(".side-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.body.classList.remove("sidebar-open");
  });
});
