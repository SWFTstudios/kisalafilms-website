/**
 * Shop lookbook: a "Reserve yours" link carries its piece into the form below,
 * so the visitor never has to find their own row in the dropdown.
 */
(() => {
  const select = document.querySelector("[data-reserve-select]");
  if (!select) return;

  document.querySelectorAll("[data-reserve]").forEach((link) => {
    link.addEventListener("click", () => {
      const piece = link.getAttribute("data-reserve");
      const match = Array.from(select.options).find((o) => o.value.startsWith(piece));
      if (match) select.value = match.value;
      // The anchor still handles the scroll; focus lands after it settles.
      setTimeout(() => select.focus({ preventScroll: true }), 400);
    });
  });
})();
