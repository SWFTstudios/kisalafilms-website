/**
 * Vinyl project pricing — set labour by difficulty + vinyl at Metro cost × markup.
 * Keep in sync with public/js/kisala-config.js → projectCheckout.
 */

export const VINYL_MARKUP = 1.4;
export const ROLL_LENGTH_FT = 25;
export const ROLL_WIDTH_FT = 5;

/** Set labour (USD) for a motorcycle wrap by fairing difficulty 1–5. */
export const MOTORCYCLE_LABOUR: Record<
  "full" | "accent",
  Record<number, number>
> = {
  full: { 1: 850, 2: 1100, 3: 1450, 4: 1850, 5: 2400 },
  accent: { 1: 350, 2: 450, 3: 575, 4: 750, 5: 950 },
};

/** Set labour (USD) for a helmet wrap by film-difficulty 1–5. */
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

/** Film finish → install difficulty for helmet (and waste buffer). */
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

export type ProjectSurface = "motorcycle" | "helmet";
export type ProjectCoverage = "full" | "accent";

export type ProjectQuoteInput = {
  surface: ProjectSurface;
  coverage: ProjectCoverage;
  /** Bike fairing difficulty 1–5 (motorcycle). */
  bikeDifficulty?: number;
  bodyClass?: string;
  /** Film finish label (helmet difficulty). */
  filmFinish?: string;
  /** Metro roll cost (USD) from D1. */
  rollCostUsd: number;
};

export type ProjectQuote = {
  surface: ProjectSurface;
  coverage: ProjectCoverage;
  difficulty: number;
  difficultyLabel: string;
  labourUsd: number;
  linearFeet: number;
  rolls: number;
  rollWidthFt: number;
  rollLengthFt: number;
  rollCostUsd: number;
  vinylMarkup: number;
  vinylSellUsd: number;
  totalUsd: number;
  amountCents: number;
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

export function quoteProject(input: ProjectQuoteInput): ProjectQuote | null {
  const cost = Number(input.rollCostUsd);
  if (!Number.isFinite(cost) || cost <= 0) return null;

  const surface = input.surface;
  const coverage: ProjectCoverage =
    surface === "helmet" ? "full" : input.coverage === "accent" ? "accent" : "full";

  let difficulty: number;
  let labourUsd: number;
  let linearFeet: number;
  let difficultyLabel: string;

  if (surface === "helmet") {
    difficulty = clampDifficulty(filmDifficultyFromFinish(input.filmFinish));
    labourUsd = HELMET_LABOUR[difficulty] ?? HELMET_LABOUR[3];
    linearFeet = HELMET_FEET;
    difficultyLabel = `Helmet · film level ${difficulty}/5`;
  } else {
    difficulty = clampDifficulty(input.bikeDifficulty ?? 3);
    const table = MOTORCYCLE_LABOUR[coverage];
    labourUsd = table[difficulty] ?? table[3];
    if (coverage === "accent") {
      linearFeet = ACCENT_FEET;
      difficultyLabel = `Accent package · bike level ${difficulty}/5`;
    } else {
      const body = input.bodyClass || "unknown";
      linearFeet = FULL_FEET_BY_BODY[body] ?? FULL_FEET_BY_BODY.unknown;
      difficultyLabel = `Full wrap · bike level ${difficulty}/5`;
    }
  }

  const rolls = rollsForFeet(linearFeet);
  const vinylSellUsd = sellFromCost(cost * rolls);
  const totalUsd = roundMoney(labourUsd + vinylSellUsd);

  return {
    surface,
    coverage,
    difficulty,
    difficultyLabel,
    labourUsd,
    linearFeet,
    rolls,
    rollWidthFt: ROLL_WIDTH_FT,
    rollLengthFt: ROLL_LENGTH_FT,
    rollCostUsd: roundMoney(cost),
    vinylMarkup: VINYL_MARKUP,
    vinylSellUsd,
    totalUsd,
    amountCents: Math.round(totalUsd * 100),
  };
}
