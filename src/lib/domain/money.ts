import Decimal from "decimal.js";

// One global precision for all domain math. Never use JS numbers for money.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export type Numeric = string | number | Decimal;

export function dec(value: Numeric): Decimal {
  return new Decimal(value);
}

/** Round to 2 decimals, half-up — matches PostgreSQL round(numeric, 2). */
export function money(value: Numeric): Decimal {
  return dec(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function min(a: Decimal, b: Decimal): Decimal {
  return a.lessThan(b) ? a : b;
}

export function clampPercent(value: Decimal): Decimal {
  if (value.lessThan(0)) return new Decimal(0);
  if (value.greaterThan(100)) return new Decimal(100);
  return value;
}
