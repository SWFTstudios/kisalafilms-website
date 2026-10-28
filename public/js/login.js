/**
 * /login — passwordless sign-in to the client portal.
 *
 * Step one asks for the email and calls /api/auth/request, which emails a
 * one-time link and a 6-digit code. Step two takes the code, for the rider who
 * opened the email on another device. The link itself never comes back here:
 * it signs in at /api/auth/verify and redirects straight to the portal.
 */
(() => {
  const emailForm = document.querySelector("[data-login-email]");
  const codeForm = document.querySelector("[data-login-code]");
  const note = document.querySelector("[data-login-note]");
  if (!emailForm || !codeForm) return;

  const params = new URLSearchParams(location.search);
  const raw = params.get("next") || "/portal";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/portal";
  let address = "";

  const say = (text, isError = false) => {
    note.textContent = text;
    note.hidden = !text;
    note.classList.toggle("is-error", isError);
  };

  if (params.has("expired")) say("That sign-in link has expired or was already used. Request a fresh one below.", true);

  // Already signed in: straight through.
  fetch("/api/me", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((me) => { if (me.signedIn) location.replace(next); })
    .catch(() => {});

  const busy = (form, on) => {
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = on;
  };

  emailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    address = emailForm.elements.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) { say("Enter a valid email address.", true); return; }
    busy(emailForm, true);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      say("");
      emailForm.hidden = true;
      codeForm.hidden = false;
      codeForm.querySelector("[data-login-sent-to]").textContent = address;
      if (data.devCode) {
        const dev = codeForm.querySelector("[data-login-dev]");
        dev.hidden = false;
        dev.textContent = `Local dev: your code is ${data.devCode}.`;
      }
      codeForm.elements.code.focus();
    } catch (err) {
      say(err.message, true);
    } finally {
      busy(emailForm, false);
    }
  });

  codeForm.elements.code.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
    if (e.target.value.length === 6) codeForm.requestSubmit();
  });

  codeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    busy(codeForm, true);
    try {
      const res = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: address, code: codeForm.elements.code.value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That code didn't work.");
      location.assign(data.next || next);
    } catch (err) {
      say(err.message, true);
      codeForm.elements.code.select();
    } finally {
      busy(codeForm, false);
    }
  });

  codeForm.querySelector("[data-login-restart]").addEventListener("click", () => {
    codeForm.hidden = true;
    emailForm.hidden = false;
    say("");
    emailForm.elements.email.focus();
  });
})();
