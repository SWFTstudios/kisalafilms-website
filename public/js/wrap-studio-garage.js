/**
 * Wrap Studio garage: save multiple bike builds on-device, resume later,
 * show onboarding progress, and (optionally) email a compiled sheet copy.
 *
 * Markup hooks under [data-wrap-studio] / [data-studio-garage]:
 *   [data-garage-modal]           signup / save dialog
 *   [data-garage-select]          switch builds
 *   [data-garage-list]            progress cards
 *   [data-build-progress-list]    step checklist for the active build
 *   [data-garage-open-save]       open modal
 *   [data-garage-save]            quick-save active build
 *   [data-garage-new]             start a new build
 *   [data-garage-status]          status line
 */
(() => {
  const form = document.querySelector("[data-wrap-studio]");
  if (!form) return;

  const STORAGE_KEY = form.getAttribute("data-studio-storage") || "kisala-wrap-studio-garage";
  const ACCOUNT_KEY = "kisala-wrap-studio-account";

  const garageRoot = document.querySelector("[data-studio-garage]");
  const modal = document.querySelector("[data-garage-modal]");
  const modalForm = document.querySelector("[data-garage-signup-form]");
  const selectEl = document.querySelector("[data-garage-select]");
  const listEl = document.querySelector("[data-garage-list]");
  const progressEl = document.querySelector("[data-build-progress-list]");
  const statusEl = document.querySelector("[data-garage-status]");
  const accountOut = document.querySelector("[data-garage-account]");
  const openBtns = document.querySelectorAll("[data-garage-open-save]");
  const saveBtn = document.querySelector("[data-garage-save]");
  const newBtn = document.querySelector("[data-garage-new]");
  const deleteBtn = document.querySelector("[data-garage-delete]");
  const statusSelect = document.querySelector("[data-garage-status-select]");
  const emailCopyForm = document.querySelector("[data-garage-email-form]");

  const STEPS = [
    {
      id: "bike",
      label: "Bike",
      done: (d) => !!(d.fields.year && d.fields.make && d.fields.model),
    },
    {
      id: "service",
      label: "Service",
      done: (d) => !!d.fields.service,
    },
    {
      id: "colour",
      label: "Colour & finish",
      done: (d) => !!(d.fields.finish || d.fields.vinyl_color),
    },
    {
      id: "transport",
      label: "Getting here",
      done: (d) => !!d.fields.transport,
    },
    {
      id: "photos",
      label: "Photos",
      done: (d) => Number(d.photoCount || 0) > 0,
    },
    {
      id: "contact",
      label: "Your details",
      done: (d) => !!(d.fields.name && d.fields.email),
    },
    {
      id: "sent",
      label: "Sent to garage",
      done: (d) => d.status === "sent" || d.status === "in_progress" || d.status === "complete",
    },
    {
      id: "build",
      label: "Build in progress",
      done: (d) => d.status === "in_progress" || d.status === "complete",
    },
    {
      id: "complete",
      label: "Complete",
      done: (d) => d.status === "complete",
    },
  ];

  let garage = { v: 1, activeId: null, setups: {} };
  /** @type {{ name: string, email: string } | null} */
  let account = null;
  let activeSetupId = null;
  let persistTimer = null;
  let suppressPersist = false;

  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function uid() {
    return `build_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function readGarage() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!raw || typeof raw !== "object" || !raw.setups) return { v: 1, activeId: null, setups: {} };
      return raw;
    } catch {
      return { v: 1, activeId: null, setups: {} };
    }
  }

  function writeGarage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(garage));
    } catch {
      /* private mode */
    }
    scheduleCloudSync();
  }

  let cloudTimer = null;
  function scheduleCloudSync() {
    if (!window.KisalaAuth) return;
    window.clearTimeout(cloudTimer);
    cloudTimer = window.setTimeout(() => {
      syncGarageToCloud().catch((err) => console.warn("cloud sync", err));
    }, 700);
  }

  async function syncGarageToCloud() {
    if (!window.KisalaAuth) return;
    const user = await window.KisalaAuth.currentUser();
    if (!user) return;
    await window.KisalaAuth.ensureCustomerDoc(user);
    const entries = Object.entries(garage.setups || {});
    for (const [id, setup] of entries) {
      await window.KisalaAuth.pushBuild(user.uid, id, {
        ...setup,
        status: setup.status || "draft",
        title: setup.label || id,
      });
    }
  }

  async function mergeCloudBuilds(user) {
    if (!window.KisalaAuth || !user) return;
    const remote = await window.KisalaAuth.pullBuilds(user.uid);
    const remoteIds = Object.keys(remote);
    const localIds = Object.keys(garage.setups || {});
    if (!remoteIds.length) {
      if (localIds.length) {
        const ok = window.confirm(
          `Import ${localIds.length} build${localIds.length === 1 ? "" : "s"} from this device into your account?`
        );
        if (ok) await syncGarageToCloud();
      }
      return;
    }
    // Prefer newer updatedAt; keep local-only builds.
    for (const [id, setup] of Object.entries(remote)) {
      const local = garage.setups[id];
      const remoteTs = Number(setup.updatedAt || 0);
      const localTs = Number(local?.updatedAt || 0);
      if (!local || remoteTs >= localTs) {
        garage.setups[id] = { ...setup, id };
      }
    }
    if (!garage.activeId || !garage.setups[garage.activeId]) {
      garage.activeId = Object.keys(garage.setups)[0] || null;
    }
    writeGarage();
  }

  function readAccount() {
    try {
      const raw = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null");
      if (!raw || !raw.email) return null;
      return { name: String(raw.name || ""), email: String(raw.email || "") };
    } catch {
      return null;
    }
  }

  function writeAccount(next) {
    account = next;
    try {
      if (next) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
      else localStorage.removeItem(ACCOUNT_KEY);
    } catch {
      /* private mode */
    }
    renderAccount();
  }

  function photoCount() {
    const input = form.querySelector("[data-photo-input]");
    return input?.files?.length || 0;
  }

  function defaultLabel() {
    const year = form.querySelector("[data-bike-year]")?.value || "";
    const make = form.querySelector("[data-bike-make]")?.value || "";
    const model = form.querySelector("[data-bike-model]")?.value || "";
    const service = form.querySelector('input[name="service"]:checked')?.value || "";
    const bike = [year, make, model].filter(Boolean).join(" ");
    if (bike && service) return `${bike} — ${service}`;
    if (bike) return bike;
    if (service) return service;
    return `Build ${Object.keys(garage.setups).length + 1}`;
  }

  function collectDraft() {
    const fields = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name || el.name.startsWith("_")) return;
      if (el.type === "file") return;
      if (el.type === "checkbox" && el.name === "addons") return;
      if (el.type === "checkbox" && el.name === "consent") return;
      if (el.type === "radio") {
        if (el.checked) fields[el.name] = el.value;
        return;
      }
      fields[el.name] = el.value;
    });
    const addons = Array.from(form.querySelectorAll('input[name="addons"]:checked')).map(
      (el) => el.value
    );
    const consent = !!form.querySelector('[name="consent"]')?.checked;
    const existing = garage.setups[activeSetupId] || {};
    return {
      id: activeSetupId,
      label: existing.label || defaultLabel(),
      fields,
      addons,
      consent,
      photoCount: photoCount(),
      status: existing.status || "draft",
      createdAt: existing.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
  }

  function progressFor(draft) {
    const done = STEPS.filter((s) => s.done(draft)).length;
    return {
      done,
      total: STEPS.length,
      pct: Math.round((done / STEPS.length) * 100),
      steps: STEPS.map((s) => ({ id: s.id, label: s.label, done: s.done(draft) })),
    };
  }

  function compileBuildSheet(draft) {
    const f = draft.fields || {};
    const lines = [
      "Kisala Films — your wrap build sheet",
      "====================================",
      "",
      `Build: ${draft.label || "Untitled"}`,
      `Status: ${draft.status || "draft"}`,
      `Progress: ${progressFor(draft).pct}%`,
      "",
      `Bike: ${[f.year, f.make, f.model].filter(Boolean).join(" ") || "—"}`,
      `Body class: ${f.bike_body_class || "—"}`,
      `Service: ${f.service || "—"}`,
      `Finish: ${f.finish || "—"}`,
      `Coverage: ${f.coverage || "—"}`,
      `Film: ${f.vinyl_color || f.vinyl_color_query || "—"}`,
      `Film brand: ${f.vinyl_vendor || "—"}`,
      `Film finish: ${f.vinyl_finish || "—"}`,
      `Film URL: ${f.vinyl_url || "—"}`,
      `Part colours: ${f.part_colours || "—"}`,
      `Parts: ${f.wrap_parts_summary || "—"}`,
      `Add-ons: ${(draft.addons || []).join(", ") || "None"}`,
      `Saved films: ${f.saved_films || "—"}`,
      `Transport: ${f.transport || "—"}`,
      `Pickup zone: ${f.pickup_zone || "—"}`,
      `Pickup area: ${f.pickup_area || "—"}`,
      `Pickup notes: ${f.pickup_notes || "—"}`,
      `Photos attached: ${draft.photoCount || 0}`,
      `Budget: ${f.budget || "—"}`,
      `Timeline: ${f.timeline || "—"}`,
      `Feature: ${f.feature || "—"}`,
      `Ballpark: ${f.ballpark_estimate || "—"}`,
      `Transport est.: ${f.transport_estimate || "—"}`,
      `Total range: ${f.estimate_total_range || "—"}`,
      "",
      `Name: ${f.name || "—"}`,
      `Email: ${f.email || "—"}`,
      `Phone: ${f.phone || "—"}`,
      `City: ${f.city || "—"}`,
      "",
      "Notes:",
      f.notes || "—",
      "",
      "Resume anytime: https://kisalafilms-website.elombe.workers.dev/wrap-studio",
      "(Builds sync to your Kisala Films account when signed in; otherwise they stay on this device.)",
    ];
    return lines.join("\n");
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  function renderAccount() {
    if (!accountOut) return;
    if (window.__kisalaFirebaseUser?.email) {
      const u = window.__kisalaFirebaseUser;
      accountOut.innerHTML = `Signed in as ${escapeHtml(
        u.displayName || u.email
      )} · builds sync to your account · <a href="/login">Account</a>`;
    } else if (account?.email) {
      accountOut.innerHTML = `Saved on this device as ${escapeHtml(
        account.name || account.email
      )}. <a href="/login">Log in</a> to sync across phones.`;
    } else {
      accountOut.innerHTML = `Save builds on this device, or <a href="/login">create an account</a> to sync them.`;
    }
  }

  function renderProgress(draft) {
    if (!progressEl) return;
    const prog = progressFor(draft || collectDraft());
    progressEl.innerHTML = prog.steps
      .map(
        (s) =>
          `<li class="studio-progress-item${s.done ? " is-done" : ""}"><span class="studio-progress-mark" aria-hidden="true"></span><span>${escapeHtml(
            s.label
          )}</span></li>`
      )
      .join("");
    const pctOut = document.querySelector("[data-build-progress-pct]");
    if (pctOut) pctOut.textContent = `${prog.pct}%`;
    const progressField = form.querySelector("[data-build-progress]");
    if (progressField) progressField.value = `${prog.pct}% · ${prog.done}/${prog.total} steps`;
  }

  function renderSelect() {
    if (!selectEl) return;
    const entries = Object.values(garage.setups).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );
    selectEl.innerHTML = entries
      .map((s) => {
        const prog = progressFor(s);
        return `<option value="${escapeHtml(s.id)}">${escapeHtml(
          s.label || "Untitled"
        )} · ${prog.pct}%</option>`;
      })
      .join("");
    if (activeSetupId) selectEl.value = activeSetupId;
    if (deleteBtn) deleteBtn.hidden = !activeSetupId || !garage.setups[activeSetupId];
  }

  function renderList() {
    if (!listEl) return;
    const entries = Object.values(garage.setups).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );
    if (!entries.length) {
      listEl.innerHTML =
        '<li class="studio-garage-empty">No saved builds yet. Save this one, or <a href="/login">log in</a> to sync across devices.</li>';
      return;
    }
    listEl.innerHTML = entries
      .map((s) => {
        const prog = progressFor(s);
        const active = s.id === activeSetupId ? " is-active" : "";
        return `<li class="studio-garage-card${active}">
          <button type="button" class="studio-garage-card-btn" data-garage-load="${escapeHtml(s.id)}">
            <strong>${escapeHtml(s.label || "Untitled")}</strong>
            <span>${escapeHtml(s.status || "draft")} · ${prog.pct}%</span>
          </button>
          <div class="studio-garage-card-bar" aria-hidden="true"><i style="width:${prog.pct}%"></i></div>
        </li>`;
      })
      .join("");
  }

  function schedulePersist() {
    if (suppressPersist) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      if (!activeSetupId) ensureActiveSetup();
      const draft = collectDraft();
      garage.setups[activeSetupId] = {
        ...(garage.setups[activeSetupId] || {}),
        ...draft,
      };
      garage.activeId = activeSetupId;
      writeGarage();
      renderSelect();
      renderList();
      renderProgress(draft);
      syncStatusSelect(draft);
    }, 220);
  }

  function waitForBikeOptions() {
    return new Promise((resolve) => {
      const make = form.querySelector("[data-bike-make]");
      if (!make) return resolve();
      if (make.options.length > 1) return resolve();
      let tries = 0;
      const tick = () => {
        if (make.options.length > 1 || tries > 40) return resolve();
        tries += 1;
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async function applyDraft(draft) {
    if (!draft) return;
    suppressPersist = true;

    form.querySelectorAll('input[type="radio"]').forEach((el) => {
      el.checked = false;
    });
    form.querySelectorAll('input[name="addons"]').forEach((el) => {
      el.checked = false;
    });

    const fields = draft.fields || {};
    if (fields.year) {
      const year = form.querySelector("[data-bike-year]");
      if (year) year.value = fields.year;
    }
    await waitForBikeOptions();
    const make = form.querySelector("[data-bike-make]");
    const model = form.querySelector("[data-bike-model]");
    if (make && fields.make) {
      make.value = fields.make;
      make.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await new Promise((r) => setTimeout(r, 40));
    if (model && fields.model) {
      model.disabled = false;
      model.value = fields.model;
      model.dispatchEvent(new Event("change", { bubbles: true }));
    }

    Object.entries(fields).forEach(([name, value]) => {
      if (["year", "make", "model", "addons"].includes(name)) return;
      const el = form.elements.namedItem(name);
      if (!el) return;
      if (el instanceof RadioNodeList || (el.length && el[0]?.type === "radio")) {
        Array.from(el).forEach((n) => {
          n.checked = n.value === value;
        });
        return;
      }
      if (el.type === "checkbox") {
        el.checked = !!value;
        return;
      }
      el.value = value == null ? "" : String(value);
    });

    (draft.addons || []).forEach((value) => {
      const box = Array.from(form.querySelectorAll('input[name="addons"]')).find(
        (el) => el.value === value
      );
      if (box) box.checked = true;
    });

    const consent = form.querySelector('[name="consent"]');
    if (consent) consent.checked = !!draft.consent;

    const selected = form.querySelector("[data-vinyl-selected]");
    const clearBtn = form.querySelector("[data-vinyl-clear]");
    if (selected && fields.vinyl_color) {
      selected.hidden = false;
      const link = fields.vinyl_url
        ? `<a class="vinyl-picked-link" href="${escapeHtml(
            fields.vinyl_url
          )}" target="_blank" rel="noopener">View on Metro</a>`
        : "";
      selected.innerHTML = `<div class="vinyl-picked-copy"><strong>${escapeHtml(
        fields.vinyl_color
      )}</strong>${link}</div>`;
      if (clearBtn) clearBtn.hidden = false;
    }

    form.dispatchEvent(new Event("change", { bubbles: true }));
    suppressPersist = false;
    renderProgress(draft);
    renderSelect();
    renderList();
    syncStatusSelect(draft);
  }

  function ensureActiveSetup() {
    if (activeSetupId && garage.setups[activeSetupId]) return;
    activeSetupId = uid();
    garage.setups[activeSetupId] = {
      id: activeSetupId,
      label: "Current build",
      fields: {},
      addons: [],
      consent: false,
      photoCount: 0,
      status: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    garage.activeId = activeSetupId;
    writeGarage();
  }

  function clearFormForNew() {
    form.querySelectorAll('input[type="radio"]').forEach((el) => {
      el.checked = false;
    });
    form.querySelectorAll('input[name="addons"]').forEach((el) => {
      el.checked = false;
    });
    const drop = form.querySelector(
      'input[name="transport"][value="Drop-off — riding it in myself"]'
    );
    if (drop) drop.checked = true;

    [
      "finish",
      "coverage",
      "budget",
      "timeline",
      "feature",
      "name",
      "email",
      "phone",
      "city",
      "notes",
      "pickup_zone",
      "pickup_area",
      "pickup_notes",
      "vinyl_color_query",
    ].forEach((name) => {
      const el = form.elements.namedItem(name);
      if (el && !(el instanceof RadioNodeList)) el.value = "";
    });
    [
      "vinyl_color",
      "vinyl_handle",
      "vinyl_url",
      "vinyl_vendor",
      "vinyl_type",
      "vinyl_finish",
      "bike",
      "bike_body_class",
      "bike_difficulty",
      "fairing_rr_hours_low",
      "fairing_rr_hours_high",
      "fairing_rr_label",
      "part_colours",
      "wrap_parts_summary",
    ].forEach((name) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) el.value = "";
    });

    const year = form.querySelector("[data-bike-year]");
    const make = form.querySelector("[data-bike-make]");
    const model = form.querySelector("[data-bike-model]");
    if (year) year.value = "";
    if (make) {
      make.value = "";
      make.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (model) {
      model.value = "";
      model.disabled = true;
    }
    const consent = form.querySelector('[name="consent"]');
    if (consent) consent.checked = false;
    form.querySelector("[data-vinyl-selected]")?.setAttribute("hidden", "");
    form.querySelector("[data-vinyl-clear]")?.setAttribute("hidden", "");
    if (account?.email) {
      const nameEl = form.querySelector('[name="name"]');
      const emailEl = form.querySelector('[name="email"]');
      if (nameEl && account.name) nameEl.value = account.name;
      if (emailEl) emailEl.value = account.email;
    }
    form.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function openModal() {
    if (!modal) return;
    const draft = collectDraft();
    const nameInput = modal.querySelector('[name="garage_name"]');
    const emailInput = modal.querySelector('[name="garage_email"]');
    const labelInput = modal.querySelector('[name="garage_label"]');
    if (nameInput) nameInput.value = account?.name || draft.fields.name || "";
    if (emailInput) emailInput.value = account?.email || draft.fields.email || "";
    if (labelInput) labelInput.value = draft.label || defaultLabel();
    modal.hidden = false;
    document.body.classList.add("lb-lock");
    nameInput?.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("lb-lock");
  }

  function markSent() {
    ensureActiveSetup();
    const draft = collectDraft();
    draft.status = "sent";
    garage.setups[activeSetupId] = {
      ...(garage.setups[activeSetupId] || {}),
      ...draft,
    };
    writeGarage();
  }

  // ---- Wire UI -----------------------------------------------------------
  openBtns.forEach((btn) => btn.addEventListener("click", openModal));
  modal?.querySelectorAll("[data-garage-close]").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.hidden) closeModal();
  });

  modalForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = String(modalForm.querySelector('[name="garage_name"]')?.value || "").trim();
    const email = String(modalForm.querySelector('[name="garage_email"]')?.value || "").trim();
    const label = String(modalForm.querySelector('[name="garage_label"]')?.value || "").trim();
    const emailCopy = !!modalForm.querySelector('[name="garage_email_copy"]')?.checked;
    if (!email) return;

    writeAccount({ name, email });
    const nameEl = form.querySelector('[name="name"]');
    const emailEl = form.querySelector('[name="email"]');
    if (nameEl && name) nameEl.value = name;
    if (emailEl) emailEl.value = email;

    ensureActiveSetup();
    const draft = collectDraft();
    draft.label = label || defaultLabel();
    garage.setups[activeSetupId] = {
      ...(garage.setups[activeSetupId] || {}),
      ...draft,
    };
    garage.activeId = activeSetupId;
    writeGarage();
    renderSelect();
    renderList();
    renderProgress(draft);
    setStatus(`Saved “${draft.label}” to your garage on this device.`);
    window.KisalaTrack?.("garage_save", { label: draft.label });

    if (emailCopy && emailCopyForm) {
      const summary = compileBuildSheet(draft);
      emailCopyForm.querySelector('[name="email"]').value = email;
      emailCopyForm.querySelector('[name="name"]').value = name;
      emailCopyForm.querySelector('[name="_cc"]').value = email;
      emailCopyForm.querySelector('[name="build_sheet_summary"]').value = summary;
      emailCopyForm.querySelector('[name="build_label"]').value = draft.label;
      emailCopyForm.querySelector('[name="build_progress"]').value = `${progressFor(draft).pct}%`;
      closeModal();
      emailCopyForm.submit();
      return;
    }

    closeModal();
  });

  saveBtn?.addEventListener("click", () => {
    ensureActiveSetup();
    const draft = collectDraft();
    draft.label = defaultLabel();
    garage.setups[activeSetupId] = {
      ...(garage.setups[activeSetupId] || {}),
      ...draft,
    };
    writeGarage();
    renderSelect();
    renderList();
    renderProgress(draft);
    setStatus(`Saved “${draft.label}”.`);
  });

  newBtn?.addEventListener("click", () => {
    if (activeSetupId) {
      garage.setups[activeSetupId] = {
        ...(garage.setups[activeSetupId] || {}),
        ...collectDraft(),
      };
      writeGarage();
    }
    clearFormForNew();
    activeSetupId = uid();
    garage.setups[activeSetupId] = {
      id: activeSetupId,
      label: `Build ${Object.keys(garage.setups).length + 1}`,
      fields: {},
      addons: [],
      consent: false,
      photoCount: 0,
      status: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    garage.activeId = activeSetupId;
    writeGarage();
    renderSelect();
    renderList();
    renderProgress(garage.setups[activeSetupId]);
    setStatus("New build started. Save it whenever you’re ready.");
  });

  deleteBtn?.addEventListener("click", async () => {
    if (!activeSetupId || !garage.setups[activeSetupId]) return;
    const label = garage.setups[activeSetupId].label || "this build";
    if (!window.confirm(`Delete “${label}” from this device?`)) return;
    const deletedId = activeSetupId;
    delete garage.setups[activeSetupId];
    const remaining = Object.keys(garage.setups);
    activeSetupId = remaining[0] || null;
    garage.activeId = activeSetupId;
    writeGarage();
    if (window.KisalaAuth) {
      try {
        const user = await window.KisalaAuth.currentUser();
        if (user) await window.KisalaAuth.deleteBuild(user.uid, deletedId);
      } catch (err) {
        console.warn("cloud delete", err);
      }
    }
    if (activeSetupId) {
      applyDraft(garage.setups[activeSetupId]);
      setStatus(`Loaded “${garage.setups[activeSetupId].label}”.`);
    } else {
      newBtn?.click();
      setStatus("Build deleted.");
    }
    renderSelect();
    renderList();
  });

  selectEl?.addEventListener("change", () => {
    const id = selectEl.value;
    if (!id || id === activeSetupId || !garage.setups[id]) return;
    if (activeSetupId) {
      garage.setups[activeSetupId] = {
        ...(garage.setups[activeSetupId] || {}),
        ...collectDraft(),
      };
    }
    activeSetupId = id;
    garage.activeId = id;
    writeGarage();
    applyDraft(garage.setups[id]);
    setStatus(`Resumed “${garage.setups[id].label}”.`);
  });

  listEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-garage-load]");
    if (!btn) return;
    const id = btn.getAttribute("data-garage-load");
    if (!id || !garage.setups[id]) return;
    selectEl.value = id;
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  });

  statusSelect?.addEventListener("change", () => {
    if (!activeSetupId || !garage.setups[activeSetupId]) return;
    garage.setups[activeSetupId].status = statusSelect.value || "draft";
    garage.setups[activeSetupId].updatedAt = Date.now();
    writeGarage();
    renderList();
    renderProgress(garage.setups[activeSetupId]);
    setStatus(`Status set to “${statusSelect.options[statusSelect.selectedIndex].text}”.`);
  });

  function syncStatusSelect(draft) {
    if (!statusSelect) return;
    statusSelect.value = draft?.status || "draft";
  }

  form.addEventListener("input", schedulePersist);
  form.addEventListener("change", schedulePersist);

  form.addEventListener("submit", () => {
    markSent();
  });

  // Expose helpers for wrap-studio.js email compile
  window.KisalaGarage = {
    collectDraft,
    compileBuildSheet,
    progressFor,
    markSent,
    openModal,
    account: () => account,
  };

  // Boot
  garage = readGarage();
  account = readAccount();

  if (window.KisalaAuth) {
    window.KisalaAuth.onAuth(async (user) => {
      window.__kisalaFirebaseUser = user || null;
      renderAccount();
      if (user) {
        try {
          await mergeCloudBuilds(user);
          if (garage.activeId && garage.setups[garage.activeId]) {
            activeSetupId = garage.activeId;
            await applyDraft(garage.setups[activeSetupId]);
          }
          renderSelect();
          renderList();
          renderProgress(garage.setups[activeSetupId]);
          setStatus(`Synced cloud garage for ${user.email}.`);
        } catch (err) {
          console.warn(err);
        }
      }
    });
  }

  renderAccount();

  if (garage.activeId && garage.setups[garage.activeId]) {
    activeSetupId = garage.activeId;
    applyDraft(garage.setups[activeSetupId]).then(() => {
      setStatus(`Welcome back — resumed “${garage.setups[activeSetupId].label}”.`);
    });
  } else {
    ensureActiveSetup();
    if (account?.email) {
      const nameEl = form.querySelector('[name="name"]');
      const emailEl = form.querySelector('[name="email"]');
      if (nameEl && !nameEl.value && account.name) nameEl.value = account.name;
      if (emailEl && !emailEl.value) emailEl.value = account.email;
    }
    renderSelect();
    renderList();
    const draft = collectDraft();
    renderProgress(draft);
    syncStatusSelect(draft);
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("saved") === "1") {
    setStatus("Build sheet copy emailed — check your inbox.");
  }
})();
