import { Decimal } from "./money";
import { marginPercent, QuoteTotals } from "./pricing";

export const GUARDRAILS = {
  /** warn below this gross margin */
  minMarginPercent: 15,
  /** require an admin above this header discount */
  maxDiscountPercent: 15,
};

export type GuardrailResult = {
  warnings: string[];
  blockers: string[];
};

export function evaluateGuardrails(input: {
  totals: QuoteTotals;
  fxRateMmkPerUnit: string | number;
  costTotalMmk: string | number;
  isAdmin: boolean;
}): GuardrailResult {
  const warnings: string[] = [];
  const blockers: string[] = [];

  const revenueMmk = input.totals.subtotal
    .minus(input.totals.discountTotal)
    .mul(new Decimal(input.fxRateMmkPerUnit));
  const margin = marginPercent(revenueMmk, input.costTotalMmk).toDecimalPlaces(1);

  if (margin.lessThan(0)) {
    blockers.push(`Negative margin (${margin.toString()}%). Admin approval required.`);
  } else if (margin.lessThan(GUARDRAILS.minMarginPercent)) {
    warnings.push(`Low margin (${margin.toString()}%). Review the price.`);
  }

  if (
    input.totals.subtotal.greaterThan(0) &&
    input.totals.discountTotal
      .div(input.totals.subtotal)
      .mul(100)
      .greaterThan(GUARDRAILS.maxDiscountPercent) &&
    !input.isAdmin
  ) {
    blockers.push(
      `Discount above ${GUARDRAILS.maxDiscountPercent}% requires an admin.`,
    );
  }

  return { warnings, blockers };
}
