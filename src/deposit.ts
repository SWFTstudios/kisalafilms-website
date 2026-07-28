/**
 * Build-deposit math — keep in sync with public/js/kisala-config.js `deposit`
 * and the depositQuote() helper in config-apply.js.
 *
 * Deposit = percent × (service labour floor + vinyl material), rounded to $25.
 * Material = rolls × rollCost, where each film item needs at least one
 * 5ft × 25ft cast roll (rolls = max(1, ceil(linearFeet / 25)) × filmItems).
 */

export type DepositPackage = {
  serviceKey: "fullWrap" | "partialWrap";
  label: string;
  linearFeet: number;
  filmItems: number;
  labourFrom: number;
};

/** REVIEW defaults — mirror kisala-config.js until secrets/env override. */
export const DEPOSIT = {
  percent: 0.25,
  rollWidthFt: 5,
  rollLengthFt: 25,
  rollCostUsd: 450,
  packages: {
    fullWrap: {
      serviceKey: "fullWrap" as const,
      label: "Full colour-change deposit",
      linearFeet: 18,
      filmItems: 1,
      labourFrom: 1650,
    },
    partialWrap: {
      serviceKey: "partialWrap" as const,
      label: "Accent package deposit",
      linearFeet: 8,
      filmItems: 1,
      labourFrom: 575,
    },
  },
};

export type PackageKey = keyof typeof DEPOSIT.packages;

export function round25(n: number): number {
  return Math.round(n / 25) * 25;
}

export function depositQuote(packageKey: string) {
  const pkg = DEPOSIT.packages[packageKey as PackageKey];
  if (!pkg) return null;

  const length = DEPOSIT.rollLengthFt;
  const perItemRolls = Math.max(1, Math.ceil(pkg.linearFeet / length));
  const rolls = perItemRolls * pkg.filmItems;
  const material = rolls * DEPOSIT.rollCostUsd;
  const labour = pkg.labourFrom;
  const subtotal = labour + material;
  const amount = round25(subtotal * DEPOSIT.percent);

  return {
    packageKey: packageKey as PackageKey,
    label: pkg.label,
    labour,
    material,
    rolls,
    rollCost: DEPOSIT.rollCostUsd,
    rollLengthFt: length,
    rollWidthFt: DEPOSIT.rollWidthFt,
    percent: DEPOSIT.percent,
    subtotal,
    amount,
    amountCents: amount * 100,
  };
}
