/**
 * /quote — pick the actual film.
 *
 * The two fields this sits under, "desired finish" and "colour you have in
 * mind", are the whole answer on their own and always have been. This is an
 * enhancement over them: the rider who knows they want Satin Battleship Grey
 * gets to say exactly that, and everyone else ignores it. So the panel ships
 * hidden in the markup and is unhidden here, and nothing in the step depends on
 * this file running, loading, or succeeding.
 *
 * Three things it deliberately does not do:
 *
 *   - It does not fetch the catalogue on page load. The file is over half a
 *     megabyte and this is the page every route on the site funnels into, so
 *     the fetch waits until the rider opens the panel and asks for it.
 *   - It does not talk to quote.js. It writes plain form fields — the
 *     `film_types` checkboxes are markup, and the picks land in a hidden
 *     `film_choices` input, one film per line — then fires a change event and
 *     lets the summary, the email body and the D1 record read them like any
 *     other answer.
 *   - It does not narrow the grid to a dead end. The chosen finish seeds the
 *     filter, because that is the useful default, but it shows up as a chip the
 *     rider can switch off.
 */
(() => {
  const root = document.querySelector("[data-film-picker]");
  if (!root) return;

  const form = root.closest("form");
  if (!form) return;

  const DATA_URL = "/data/vinyl-colors.json";
  /** Cards per page. The catalogue runs to four figures; the grid must not. */
  const PAGE = 24;
  /** Picking a shortlist is useful, picking a hundred is not a shortlist. */
  const MAX_PICKS = 6;

  const openBtn = root.querySelector("[data-film-open]");
  const panel = root.querySelector("[data-film-panel]");
  const grid = root.querySelector("[data-film-grid]");
  const statusEl = root.querySelector("[data-film-status]");
  const searchEl = root.querySelector("[data-film-search]");
  const materialRow = root.querySelector("[data-film-materials]");
  const familyRow = root.querySelector("[data-film-families]");
  const pickedList = root.querySelector("[data-film-picked]");
  const moreBtn = root.querySelector("[data-film-more]");
  const field = root.querySelector("[data-film-field]");
  const introEl = root.querySelector("[data-film-intro]");
  const finishSelect = form.elements.finish;

  if (!openBtn || !panel || !grid || !field) return;

  /**
   * The finish select's options in the catalogue's own vocabulary.
   *
   * The catalogue splits finishes finer than the form asks about — "Super
   * Gloss" is gloss to a rider, and colour shift and carbon are colour families
   * rather than finishes — so the mapping is by hand rather than by string
   * match. Every entry here resolves to at least forty films, so choosing a
   * finish narrows the grid without ever emptying it.
   */
  const FINISH_MATCH = {
    Gloss: { finishes: ["Gloss", "Super Gloss"] },
    Satin: { finishes: ["Satin"] },
    Matte: { finishes: ["Matte"] },
    Metallic: { finishes: ["Metallic", "Pearlescent", "Candy"] },
    Chrome: { finishes: ["Chrome"], families: ["chrome"] },
    "Carbon / textured": { finishes: ["Textured", "Brushed", "Diamond"], families: ["carbon"] },
    "Colour shift": { families: ["shift"] },
  };

  /**
   * Catalogue product types, in the order they matter to a motorcycle.
   *
   * `checkbox` ties a chip to the film_types answer above, so ticking "vinyl
   * and clear PPF" opens the grid on a mix of exactly those two. The last two
   * have no checkbox because nobody wraps a whole bike in caliper film.
   */
  const MATERIALS = [
    { type: "Vinyl", label: "Vinyl wrap", checkbox: "Vinyl wrap film" },
    { type: "Colored PPF Wrap", label: "Coloured PPF", checkbox: "Coloured PPF" },
    { type: "PPF", label: "Clear PPF", checkbox: "Clear PPF" },
    { type: "Light Wrap", label: "Light film" },
    { type: "Brake Caliper", label: "Caliper" },
  ];

  let films = null;
  let loading = null;
  let familyMeta = [];
  let limit = PAGE;

  const state = {
    query: "",
    materials: new Set(),
    families: new Set(),
    /** Whether the chosen finish is still narrowing the grid. */
    useFinish: true,
  };

  /** id -> film, in the order the rider picked them. */
  const picks = new Map();

  const checkedFilmTypes = () =>
    new Set(
      Array.from(form.querySelectorAll('input[name="film_types"]:checked')).map(
        (input) => input.value
      )
    );

  const chosenFinish = () => (finishSelect && finishSelect.value) || "";

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message || "";
  }

  /* ---- Loading ------------------------------------------------------------ */
  /**
   * Fetch the catalogue once, and treat a failure as "no grid" rather than an
   * error the rider has to deal with. The finish select, the film_types
   * checkboxes and the free-text colour field are all still sitting there.
   */
  function load() {
    if (films) return Promise.resolve(films);
    if (loading) return loading;

    setStatus("Loading the film library…");
    loading = fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        familyMeta = Array.isArray(data.colorFamilies) ? data.colorFamilies : [];
        // Out-of-stock films are still in the file. Offering one is offering a
        // wait nobody agreed to.
        films = (Array.isArray(data.colors) ? data.colors : []).filter((f) => f.a !== false);
        return films;
      })
      .catch((err) => {
        console.warn("film catalogue unavailable", err);
        films = [];
        return films;
      });

    return loading;
  }

  /* ---- Filtering --------------------------------------------------------- */
  function finishRule() {
    if (!state.useFinish) return null;
    return FINISH_MATCH[chosenFinish()] || null;
  }

  function matchesFinish(film, rule) {
    if (!rule) return true;
    if (rule.finishes && rule.finishes.includes(film.f)) return true;
    if (rule.families && rule.families.includes(film.c)) return true;
    return false;
  }

  function matches(film, rule) {
    if (state.materials.size && !state.materials.has(film.t)) return false;
    if (state.families.size && !state.families.has(film.c)) return false;
    if (!matchesFinish(film, rule)) return false;

    if (state.query) {
      const hay = `${film.n} ${film.v} ${film.f} ${film.c}`.toLowerCase();
      // Every word has to land somewhere, so "matte black 3m" narrows instead
      // of widening the way an OR would.
      if (!state.query.split(/\s+/).every((word) => hay.includes(word))) return false;
    }
    return true;
  }

  const hits = () => {
    const rule = finishRule();
    return (films || []).filter((film) => matches(film, rule));
  };

  /* ---- Names ------------------------------------------------------------- */
  /**
   * Metro's titles carry the SKU and the roll size behind pipes: "3M 1080 Gloss
   * Atomic Teal Vinyl Wrap | G356 | BLOWOUT STOCK | (420 sq ft) | 241140". The
   * first segment is the name a rider recognises; the SKU is what the garage
   * orders by, so both survive and the rest is noise.
   */
  function parts(film) {
    const segments = String(film.n || "")
      .split("|")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const name = segments[0] || "Film";
    const code = segments.slice(1).find((segment) => /^[A-Z0-9][A-Z0-9-]{1,9}$/.test(segment));
    return { name, code: code || "" };
  }

  const label = (film) => {
    const { name, code } = parts(film);
    return code ? `${name} (${code})` : name;
  };

  /* ---- The hidden field -------------------------------------------------- */
  /**
   * One film per line, each line readable on its own, because this lands in an
   * email body and in a database column rather than in code. quote.js splits it
   * back on newlines to count the picks for the summary.
   */
  function writeField() {
    field.value = Array.from(picks.values())
      .map((film) =>
        [label(film), film.v, film.t, film.f || "finish n/a", film.u]
          .filter(Boolean)
          .join(" — ")
      )
      .join("\n");
  }

  function toggle(film) {
    if (picks.has(film.id)) {
      picks.delete(film.id);
    } else if (picks.size >= MAX_PICKS) {
      setStatus(`${MAX_PICKS} films is the limit — remove one to swap it out.`);
      return;
    } else {
      picks.set(film.id, film);
    }

    writeField();
    renderPicked();
    renderGrid();
    // The summary, the email field and the D1 payload all read the form, so
    // telling the form is the whole handoff.
    form.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* ---- Rendering --------------------------------------------------------- */
  function chip(text, active, onClick, swatch) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "q-film-chip";
    button.setAttribute("aria-pressed", active ? "true" : "false");
    if (active) button.classList.add("is-on");

    if (swatch) {
      const dot = document.createElement("span");
      dot.className = "q-film-chip-dot";
      dot.style.background = swatch;
      dot.setAttribute("aria-hidden", "true");
      button.appendChild(dot);
    }

    button.appendChild(document.createTextNode(text));
    button.addEventListener("click", onClick);
    return button;
  }

  function renderFilters() {
    if (materialRow) {
      materialRow.textContent = "";

      const finish = chosenFinish();
      // The finish is a filter like any other, and shown as one. A rider who
      // picked Matte and then wants to see everything can say so here instead
      // of going back a field to lie about the finish.
      if (finish && FINISH_MATCH[finish]) {
        materialRow.appendChild(
          chip(`${finish} only`, state.useFinish, () => {
            state.useFinish = !state.useFinish;
            limit = PAGE;
            renderFilters();
            renderGrid();
          })
        );
      }

      MATERIALS.forEach((material) => {
        if (!films || !films.some((film) => film.t === material.type)) return;
        materialRow.appendChild(
          chip(material.label, state.materials.has(material.type), () => {
            if (state.materials.has(material.type)) state.materials.delete(material.type);
            else state.materials.add(material.type);
            limit = PAGE;
            renderFilters();
            renderGrid();
          })
        );
      });
    }

    if (familyRow) {
      familyRow.textContent = "";
      familyMeta.forEach((family) => {
        if (!films || !films.some((film) => film.c === family.id)) return;
        familyRow.appendChild(
          chip(
            family.label,
            state.families.has(family.id),
            () => {
              if (state.families.has(family.id)) state.families.delete(family.id);
              else state.families.add(family.id);
              limit = PAGE;
              renderFilters();
              renderGrid();
            },
            family.hex
          )
        );
      });
    }
  }

  function card(film) {
    const li = document.createElement("li");
    li.className = "q-film";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "q-film-btn";
    const on = picks.has(film.id);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) button.classList.add("is-picked");

    if (film.i) {
      const img = document.createElement("img");
      img.className = "q-film-img";
      img.src = film.i;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      // Stated so a slow swatch cannot shove the grid around as it arrives.
      img.width = 160;
      img.height = 160;
      button.appendChild(img);
    }

    const body = document.createElement("span");
    body.className = "q-film-body";

    const { name, code } = parts(film);
    const title = document.createElement("span");
    title.className = "q-film-name";
    title.textContent = name;
    body.appendChild(title);

    const meta = document.createElement("span");
    meta.className = "q-film-meta";
    meta.textContent = [film.v, film.f, code].filter(Boolean).join(" · ");
    body.appendChild(meta);

    button.appendChild(body);

    const mark = document.createElement("span");
    mark.className = "q-film-mark";
    mark.setAttribute("aria-hidden", "true");
    button.appendChild(mark);

    button.addEventListener("click", () => toggle(film));
    li.appendChild(button);
    return li;
  }

  function renderGrid() {
    if (!films) return;

    const found = hits();
    grid.textContent = "";
    found.slice(0, limit).forEach((film) => grid.appendChild(card(film)));

    if (moreBtn) moreBtn.hidden = found.length <= limit;

    if (!found.length) {
      setStatus(
        films.length
          ? "Nothing matches that combination. Loosen a filter, or just describe the colour above and we'll find it."
          : "The film library didn't load. Describe the colour you're after above and we'll match it from samples."
      );
      return;
    }

    const shown = Math.min(limit, found.length);
    setStatus(
      shown < found.length
        ? `Showing ${shown} of ${found.length} films.`
        : `${found.length} film${found.length === 1 ? "" : "s"}.`
    );
  }

  function renderPicked() {
    if (!pickedList) return;
    pickedList.textContent = "";

    picks.forEach((film) => {
      const li = document.createElement("li");
      li.className = "q-film-pick";

      const text = document.createElement("span");
      text.textContent = label(film);
      li.appendChild(text);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "q-film-pick-remove";
      remove.innerHTML = "&times;";
      remove.setAttribute("aria-label", `Remove ${label(film)}`);
      remove.addEventListener("click", () => toggle(film));
      li.appendChild(remove);

      pickedList.appendChild(li);
    });

    if (introEl) {
      introEl.textContent = picks.size
        ? `${picks.size} of ${MAX_PICKS} picked. Add more, or leave it here and we'll bring samples.`
        : introText();
    }
  }

  function introText() {
    if (!films) return "Browse the films the garage actually buys, narrowed to the finish you chose.";
    const finish = chosenFinish();
    const rule = FINISH_MATCH[finish];
    if (!rule) return `${films.length} films in stock. Pick the ones you want to see in person.`;
    const n = films.filter((film) => matchesFinish(film, rule)).length;
    return `${n} ${finish.toLowerCase()} films in stock, out of ${films.length}. Pick the ones you like.`;
  }

  /* ---- Opening ----------------------------------------------------------- */
  /**
   * Seed the material chips from the film_types answer.
   *
   * Called when film_types changes and when the panel first opens, so the grid
   * opens on what the rider already said they wanted. Manual chip toggles
   * override it until the next time they change that answer.
   */
  function seedMaterials() {
    const wanted = checkedFilmTypes();
    state.materials.clear();
    MATERIALS.forEach((material) => {
      if (material.checkbox && wanted.has(material.checkbox)) state.materials.add(material.type);
    });
  }

  async function open() {
    panel.hidden = false;
    openBtn.setAttribute("aria-expanded", "true");
    openBtn.textContent = "Hide films";

    await load();
    seedMaterials();
    limit = PAGE;
    renderFilters();
    renderGrid();
    renderPicked();
  }

  function close() {
    panel.hidden = true;
    openBtn.setAttribute("aria-expanded", "false");
    openBtn.textContent = picks.size ? "Change films" : "Browse films";
  }

  openBtn.addEventListener("click", () => {
    if (panel.hidden) open();
    else close();
  });

  if (moreBtn) {
    moreBtn.addEventListener("click", () => {
      limit += PAGE;
      renderGrid();
      moreBtn.focus();
    });
  }

  if (searchEl) {
    searchEl.addEventListener("input", () => {
      state.query = searchEl.value.trim().toLowerCase();
      limit = PAGE;
      renderGrid();
    });
    // A search input's clear button fires search, not input, in Safari.
    searchEl.addEventListener("search", () => {
      state.query = searchEl.value.trim().toLowerCase();
      limit = PAGE;
      renderGrid();
    });
  }

  /* The finish and the film_types answers both change what should be on screen.
     Our own change event targets the form, so it never re-enters here. */
  form.addEventListener("change", (e) => {
    const el = e.target;
    if (!el || typeof el.matches !== "function") return;
    if (!el.matches('[name="finish"], [name="film_types"]')) return;

    if (el.name === "film_types") seedMaterials();
    else state.useFinish = true;

    limit = PAGE;
    if (!panel.hidden) {
      renderFilters();
      renderGrid();
    }
    renderPicked();
  });

  // JavaScript is here, so the picker is a real control rather than a promise.
  root.hidden = false;
  renderPicked();
})();
