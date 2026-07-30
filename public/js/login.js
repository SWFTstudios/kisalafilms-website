(() => {
  const form = document.querySelector("[data-auth-form]");
  const accountPanel = document.querySelector("[data-auth-account]");
  const buildsEl = document.querySelector("[data-auth-builds]");
  const userEl = document.querySelector("[data-auth-user]");
  const errEl = document.querySelector("[data-auth-error]");
  const statusEl = document.querySelector("[data-auth-status]");
  const submitBtn = document.querySelector("[data-auth-submit]");
  const toggleBtn = document.querySelector("[data-auth-toggle]");
  const nameField = document.querySelector("[data-auth-name-field]");
  const heading = document.querySelector("[data-auth-heading]");
  const lead = document.querySelector("[data-auth-lead]");
  const help = document.querySelector("[data-auth-signed-out-help]");
  const signOutBtn = document.querySelector("[data-auth-signout]");
  const importBtn = document.querySelector("[data-auth-import]");
  if (!form || !window.KisalaAuth) return;

  const STORAGE_KEY = "kisala-wrap-studio-garage";
  let mode = "signin";

  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function setError(msg) {
    if (!errEl) return;
    if (!msg) {
      errEl.hidden = true;
      errEl.textContent = "";
      return;
    }
    errEl.hidden = false;
    errEl.textContent = msg;
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  function setMode(next) {
    mode = next;
    form.setAttribute("data-auth-mode", mode);
    const signup = mode === "signup";
    if (nameField) nameField.hidden = !signup;
    if (submitBtn) submitBtn.textContent = signup ? "Create account" : "Sign in";
    if (toggleBtn)
      toggleBtn.textContent = signup
        ? "Already have an account? Sign in"
        : "Need an account? Create one";
    if (heading) heading.textContent = signup ? "Create account" : "Sign in";
    if (lead)
      lead.textContent = signup
        ? "Email and password via Firebase Auth. Your builds sync under this account."
        : "Use the same email you put on build sheets. Builds sync to the cloud when you’re signed in.";
    const pw = form.querySelector("#auth-password");
    if (pw) pw.setAttribute("autocomplete", signup ? "new-password" : "current-password");
  }

  function readLocalGarage() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!raw || typeof raw !== "object" || !raw.setups) return { setups: {} };
      return raw;
    } catch {
      return { setups: {} };
    }
  }

  async function renderBuilds(user) {
    if (!buildsEl || !user) return;
    const setups = await window.KisalaAuth.pullBuilds(user.uid);
    const entries = Object.values(setups).sort(
      (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
    );
    if (!entries.length) {
      buildsEl.innerHTML =
        '<li class="studio-garage-empty">No cloud builds yet. Open Wrap Studio or import from this device.</li>';
      return;
    }
    buildsEl.innerHTML = entries
      .map((s) => {
        const title = escapeHtml(s.title || s.label || s.id || "Untitled");
        const status = escapeHtml(s.status || "draft");
        return `<li class="studio-garage-card"><div class="studio-garage-card-btn" style="cursor:default"><strong>${title}</strong><span>${status}</span></div></li>`;
      })
      .join("");
  }

  function showSignedIn(user) {
    form.hidden = true;
    if (help) help.hidden = true;
    if (accountPanel) accountPanel.hidden = false;
    if (userEl)
      userEl.textContent = `Signed in as ${user.displayName || user.email || "rider"}`;
    if (heading) heading.textContent = "Your garage";
    if (lead)
      lead.textContent =
        "Builds sync when you save in Wrap Studio. Use Import to pull device-only builds into this account.";
    renderBuilds(user).catch((err) => setStatus(String(err.message || err)));
  }

  function showSignedOut() {
    form.hidden = false;
    if (help) help.hidden = false;
    if (accountPanel) accountPanel.hidden = true;
    setMode(mode);
  }

  toggleBtn?.addEventListener("click", () => {
    setMode(mode === "signin" ? "signup" : "signin");
    setError("");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const displayName = String(fd.get("displayName") || "").trim();
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    if (submitBtn) submitBtn.disabled = true;
    try {
      if (mode === "signup") {
        await window.KisalaAuth.signUp(email, password, displayName);
      } else {
        await window.KisalaAuth.signIn(email, password);
      }
      const next = new URLSearchParams(window.location.search).get("next");
      if (next && next.startsWith("/")) {
        window.location.href = next;
      }
    } catch (err) {
      setError(err?.message || "Could not authenticate.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  signOutBtn?.addEventListener("click", async () => {
    try {
      await window.KisalaAuth.signOut();
      setStatus("Signed out.");
    } catch (err) {
      setStatus(String(err.message || err));
    }
  });

  importBtn?.addEventListener("click", async () => {
    const user = await window.KisalaAuth.currentUser();
    if (!user) return;
    const local = readLocalGarage();
    const ids = Object.keys(local.setups || {});
    if (!ids.length) {
      setStatus("No builds found on this device.");
      return;
    }
    if (
      !window.confirm(
        `Import ${ids.length} build${ids.length === 1 ? "" : "s"} from this device into your account?`
      )
    )
      return;
    setStatus("Importing…");
    try {
      for (const [id, setup] of Object.entries(local.setups)) {
        await window.KisalaAuth.pushBuild(user.uid, id, {
          ...setup,
          status: setup.status || "draft",
          title: setup.label || id,
        });
      }
      await renderBuilds(user);
      setStatus(`Imported ${ids.length} build${ids.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setStatus(String(err.message || err));
    }
  });

  setMode("signin");
  window.KisalaAuth.onAuth((user) => {
    window.__kisalaFirebaseUser = user || null;
    if (user) showSignedIn(user);
    else showSignedOut();
  });
})();
