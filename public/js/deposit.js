/**
 * Pricing deposit CTAs — POST a package key to /api/checkout/deposit and
 * redirect into Stripe Checkout. Amounts are computed from kisala-config
 * (percent of labour + vinyl rolls) both here for display and again on the
 * Worker so the client cannot underpay.
 */
(() => {
  const ROOT = document.querySelector("[data-deposit]");
  if (!ROOT || !window.KisalaConfig) return;

  const money = window.KisalaConfig.money;
  const errEl = ROOT.querySelector("[data-deposit-error]");

  function showError(msg) {
    if (!errEl) return;
    errEl.hidden = !msg;
    errEl.textContent = msg || "";
  }

  function fillCard(card) {
    const key = card.getAttribute("data-deposit-package");
    const quote = window.KisalaConfig.depositQuote(key);
    if (!quote) return;

    const amount = card.querySelector("[data-deposit-amount]");
    const detail = card.querySelector("[data-deposit-detail]");
    const btn = card.querySelector("[data-deposit-pay]");

    if (amount) amount.textContent = money(quote.amount);
    if (detail) {
      const pct = Math.round(quote.percent * 100);
      detail.textContent =
        `${pct}% of ${money(quote.labour)} labour + ${quote.rolls}× ${quote.rollWidthFt}×${quote.rollLengthFt}ft roll (${money(quote.material)} vinyl)`;
    }
    if (btn) {
      btn.disabled = false;
      btn.dataset.package = key;
      btn.dataset.amount = String(quote.amount);
    }
  }

  ROOT.querySelectorAll("[data-deposit-package]").forEach(fillCard);

  const dep = window.KisalaConfig.raw.deposit;
  if (dep) {
    const pct = ROOT.querySelector("[data-deposit-pct]");
    const size = ROOT.querySelector("[data-deposit-roll-size]");
    if (pct) pct.textContent = String(Math.round((dep.percent || 0) * 100));
    if (size) size.textContent = `${dep.rollWidthFt || 5}×${dep.rollLengthFt || 25}`;
  }

  ROOT.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-deposit-pay]");
    if (!btn || btn.disabled) return;
    e.preventDefault();
    showError("");

    const packageKey = btn.dataset.package;
    if (!packageKey) return;

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Opening Stripe…";

    window.KisalaTrack?.("deposit_checkout_start", { label: packageKey });

    try {
      const res = await fetch("/api/checkout/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ package: packageKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Checkout is unavailable right now.");
      }
      window.location.href = data.url;
    } catch (err) {
      showError(err.message || "Could not start checkout.");
      btn.disabled = false;
      btn.textContent = original;
      window.KisalaTrack?.("deposit_checkout_error", { label: packageKey });
    }
  });
})();
