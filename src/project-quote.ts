/**
 * Vinyl project pricing — labour by complexity + vinyl sell price.
 * Keep in sync with public/js/kisala-config.js → projectCheckout.
 */

export const VINYL_MARKUP = 1.4;
export const ROLL_LENGTH_FT = 25;
export const ROLL_WIDTH_FT = 5;
/** Combo (bike + helmet) discount off the combined total. */
export const COMBO_DISCOUNT = 0.2;

/** Set labour (USD) for a motorcycle wrap by fairing complexity 1–5. */
export const MOTORCYCLE_LABOUR: Record<
  "full" | "accent",
  Record<number, number>
> = {
  full: { 1: 850, 2: 1100, 3: 1450, 4: 1850, 5: 2400 },
  accent: { 1: 350, 2: 450, 3: 575, 4: 750, 5: 950 },
};

/** Set labour (USD) for a helmet wrap by film complexity 1–5. */
export const HELMET_LABOUR: Record<number, number> = {
  1: 175,
  2: 200,
  3: 250,
  4: 325,
  5: 400,
};

/** Linear feet of 5ft-wide film by motorcycle body class (full wrap). */
export const FULL_FEET_BY_BODY: Record<string, number> = {
  naked_minimal: 12,
  cruiser_simple: 15,
  half_faired: 18,
  adventure_touring: 22,
  full_sport: 20,
  touring_complex: 30,
  scooter_enclosed: 16,
  dirt_mx: 12,
  sidecar_utv: 25,
  unknown: 18,
};

export const ACCENT_FEET = 8;
export const HELMET_FEET = 3;

/** Film finish → install complexity for helmet. */
export const FILM_DIFFICULTY: Record<string, number> = {
  Gloss: 1,
  Satin: 2,
  Matte: 2,
  Metallic: 3,
  Reflective: 3,
  Textured: 4,
  Chrome: 4,
  Candy: 4,
  "Color Shift": 5,
  Shift: 5,
};

export type ProjectSurface = "motorcycle" | "helmet" | "both";
export type ProjectCoverage = "full" | "accent";
export type FilmPlacement = "motorcycle" | "helmet" | "both" | "";

export type QuoteFilmInput = {
  rollCostUsd: number;
  finish?: string;
  placement?: FilmPlacement | string;
  handle?: string;
  name?: string;
};

export type ProjectQuoteInput = {
  surface: ProjectSurface;
  coverage: ProjectCoverage;
  /** Bike fairing complexity 1–5 (motorcycle / combo). */
  bikeDifficulty?: number;
  bodyClass?: string;
  /** Single-film shortcut (legacy). */
  filmFinish?: string;
  rollCostUsd?: number;
  /** Multi-film builds. */
  films?: QuoteFilmInput[];
  /** Override combo discount (0–1). Default COMBO_DISCOUNT. */
  comboDiscount?: number;
};

export type ProjectQuote = {
  surface: ProjectSurface;
  coverage: ProjectCoverage;
  difficulty: number;
  difficultyLabel: string;
  labourUsd: number;
  motorcycleLabourUsd: number;
  helmetLabourUsd: number;
  linearFeet: number;
  rolls: number;
  rollWidthFt: number;
  rollLengthFt: number;
  rollCostUsd: number;
  vinylMarkup: number;
  vinylSellUsd: number;
  subtotalUsd: number;
  comboDiscount: number;
  discountUsd: number;
  totalUsd: number;
  amountCents: number;
  filmCount: number;
};

export function clampDifficulty(n: number): number {
  const d = Math.round(Number(n) || 3);
  return Math.min(5, Math.max(1, d));
}

export function filmDifficultyFromFinish(finish?: string): number {
  if (!finish) return 2;
  const key = String(finish).trim();
  if (FILM_DIFFICULTY[key] != null) return FILM_DIFFICULTY[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(FILM_DIFFICULTY)) {
    if (lower.includes(k.toLowerCase())) return v;
  }
  return 2;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sellFromCost(costUsd: number, markup = VINYL_MARKUP): number {
  return roundMoney(costUsd * markup);
}

export function rollsForFeet(linearFeet: number, rollLength = ROLL_LENGTH_FT): number {
  return Math.max(1, Math.ceil(Math.max(0, linearFeet) / rollLength));
}

function motorcycleFeet(coverage: ProjectCoverage, bodyClass?: string): number {
  if (coverage === "accent") return ACCENT_FEET;
  const body = bodyClass || "unknown";
  return FULL_FEET_BY_BODY[body] ?? FULL_FEET_BY_BODY.unknown;
}

function normalizeFilms(input: ProjectQuoteInput): QuoteFilmInput[] {
  if (Array.isArray(input.films) && input.films.length) {
    return input.films.filter((f) => Number(f.rollCostUsd) > 0);
  }
  const cost = Number(input.rollCostUsd);
  if (Number.isFinite(cost) && cost > 0) {
    return [{ rollCostUsd: cost, finish: input.filmFinish }];
  }
  return [];
}

function filmAppliesTo(
  placement: string | undefined,
  target: "motorcycle" | "helmet",
  surface: ProjectSurface
): boolean {
  const p = String(placement || "").toLowerCase();
  if (!p || p === "both") {
    if (surface === "both") return true;
    return surface === target;
  }
  if (p === target || p === "both") return true;
  // Unspecified placement on a single-surface build always applies
  if (surface === target) return true;
  return false;
}

function vinylForFeet(
  films: QuoteFilmInput[],
  linearFeet: number
): { rolls: number; vinylSellUsd: number; avgCost: number } {
  if (!films.length || linearFeet <= 0) {
    return { rolls: 0, vinylSellUsd: 0, avgCost: 0 };
  }
  const share = linearFeet / films.length;
  let rolls = 0;
  let vinylSellUsd = 0;
  let costSum = 0;
  films.forEach((f) => {
    const r = rollsForFeet(share);
    rolls += r;
    costSum += Number(f.rollCostUsd) * r;
    vinylSellUsd += sellFromCost(Number(f.rollCostUsd) * r);
  });
  return {
    rolls,
    vinylSellUsd: roundMoney(vinylSellUsd),
    avgCost: costSum / Math.max(1, rolls),
  };
}

export function quoteProject(input: ProjectQuoteInput): ProjectQuote | null {
  const films = normalizeFilms(input);
  if (!films.length) return null;

  const surface = input.surface;
  if (surface !== "motorcycle" && surface !== "helmet" && surface !== "both") {
    return null;
  }

  const coverage: ProjectCoverage =
    surface === "helmet"
      ? "full"
      : input.coverage === "accent"
        ? "accent"
        : "full";

  let motorcycleLabourUsd = 0;
  let helmetLabourUsd = 0;
  let bikeDifficulty = 3;
  let helmetDifficulty = 3;
  let linearFeet = 0;
  let rolls = 0;
  let vinylSellUsd = 0;
  let costAccumulator = 0;
  let costRolls = 0;

  if (surface === "motorcycle" || surface === "both") {
    bikeDifficulty = clampDifficulty(input.bikeDifficulty ?? 3);
    const table = MOTORCYCLE_LABOUR[coverage];
    motorcycleLabourUsd = table[bikeDifficulty] ?? table[3];
    const feet = motorcycleFeet(coverage, input.bodyClass);
    const motoFilms = films.filter((f) =>
      filmAppliesTo(f.placement, "motorcycle", surface)
    );
    const pool = motoFilms.length ? motoFilms : films;
    const v = vinylForFeet(pool, feet);
    linearFeet += feet;
    rolls += v.rolls;
    vinylSellUsd += v.vinylSellUsd;
    costAccumulator += v.avgCost * v.rolls;
    costRolls += v.rolls;
  }

  if (surface === "helmet" || surface === "both") {
    const finishFilm =
      films.find((f) => filmAppliesTo(f.placement, "helmet", surface)) || films[0];
    helmetDifficulty = clampDifficulty(
      filmDifficultyFromFinish(finishFilm?.finish || input.filmFinish)
    );
    helmetLabourUsd = HELMET_LABOUR[helmetDifficulty] ?? HELMET_LABOUR[3];
    const helmetFilms = films.filter((f) =>
      filmAppliesTo(f.placement, "helmet", surface)
    );
    const pool = helmetFilms.length ? helmetFilms : films;
    const v = vinylForFeet(pool, HELMET_FEET);
    linearFeet += HELMET_FEET;
    rolls += v.rolls;
    vinylSellUsd += v.vinylSellUsd;
    costAccumulator += v.avgCost * v.rolls;
    costRolls += v.rolls;
  }

  const labourUsd = roundMoney(motorcycleLabourUsd + helmetLabourUsd);
  vinylSellUsd = roundMoney(vinylSellUsd);
  const subtotalUsd = roundMoney(labourUsd + vinylSellUsd);

  const comboDiscount =
    surface === "both"
      ? Math.min(
          0.5,
          Math.max(0, Number(input.comboDiscount ?? COMBO_DISCOUNT) || 0)
        )
      : 0;
  const discountUsd = roundMoney(subtotalUsd * comboDiscount);
  const totalUsd = roundMoney(subtotalUsd - discountUsd);

  let difficultyLabel = "";
  let difficulty = bikeDifficulty;
  if (surface === "helmet") {
    difficulty = helmetDifficulty;
    difficultyLabel = "Helmet wrap";
  } else if (surface === "both") {
    difficulty = Math.max(bikeDifficulty, helmetDifficulty);
    difficultyLabel = "Bike + helmet combo";
  } else if (coverage === "accent") {
    difficultyLabel = "Accent package";
  } else {
    difficultyLabel = "Full motorcycle wrap";
  }

  return {
    surface,
    coverage,
    difficulty,
    difficultyLabel,
    labourUsd,
    motorcycleLabourUsd: roundMoney(motorcycleLabourUsd),
    helmetLabourUsd: roundMoney(helmetLabourUsd),
    linearFeet,
    rolls,
    rollWidthFt: ROLL_WIDTH_FT,
    rollLengthFt: ROLL_LENGTH_FT,
    rollCostUsd: roundMoney(costRolls ? costAccumulator / costRolls : films[0].rollCostUsd),
    vinylMarkup: VINYL_MARKUP,
    vinylSellUsd,
    subtotalUsd,
    comboDiscount,
    discountUsd,
    totalUsd,
    amountCents: Math.round(totalUsd * 100),
    filmCount: films.length,
  };
}
