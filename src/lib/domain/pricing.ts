import { Decimal, Numeric, clampPercent, dec, money, min } from "./money";

export type DiscountKind = "none" | "percent" | "amount";

export type PricedLine = {
  quantity: Numeric;
  unitPrice: Numeric;
  discountPct: Numeric;
  taxRate: Numeric;
};

export type LineTotals = {
  /** quantity × unit price × (1 − line discount), 2 dp */
  lineTotal: Decimal;
  /** line total minus its pro-rata share of the header discount */
  taxBase: Decimal;
  /** taxBase × tax rate, 2 dp */
  tax: Decimal;
};

export type QuoteTotals = {
  lines: LineTotals[];
  subtotal: Decimal;
  discountTotal: Decimal;
  vatTotal: Decimal;
  grandTotal: Decimal;
};

/**
 * Authoritative mirror of recalc_quotation_totals() in SQL.
 * Both implementations are covered by the same fixture in pricing.test.ts.
 */
export function computeTotals(
  lines: PricedLine[],
  discountKind: DiscountKind,
  discountValue: Numeric,
): QuoteTotals {
  const priced = lines.map((line) => {
    const gross = dec(line.quantity).mul(dec(line.unitPrice));
    const factor = new Decimal(1).minus(clampPercent(dec(line.discountPct)).div(100));
    return {
      lineTotal: money(gross.mul(factor)),
      taxRate: dec(line.taxRate),
    };
  });

  const subtotal = priced.reduce((sum, line) => sum.plus(line.lineTotal), new Decimal(0));

  let discountTotal = new Decimal(0);
  if (discountKind === "percent") {
    discountTotal = money(subtotal.mul(clampPercent(dec(discountValue)).div(100)));
  } else if (discountKind === "amount") {
    discountTotal = min(money(dec(discountValue)), subtotal);
  }

  const result: LineTotals[] = priced.map((line) => {
    const share = subtotal.isZero()
      ? new Decimal(0)
      : discountTotal.mul(line.lineTotal).div(subtotal);
    const taxBase = line.lineTotal.minus(share);
    const tax = money(taxBase.mul(line.taxRate));
    return { lineTotal: line.lineTotal, taxBase, tax };
  });

  const vatTotal = result.reduce((sum, line) => sum.plus(line.tax), new Decimal(0));

  return {
    lines: result,
    subtotal,
    discountTotal,
    vatTotal,
    grandTotal: subtotal.minus(discountTotal).plus(vatTotal),
  };
}

/** (subtotal − discount) × fx − cost, all MMK. */
export function computeMarginMmk(
  totals: QuoteTotals,
  fxRateMmkPerUnit: Numeric,
  costTotalMmk: Numeric,
): Decimal {
  const revenue = totals.subtotal.minus(totals.discountTotal).mul(dec(fxRateMmkPerUnit));
  return money(revenue).minus(money(costTotalMmk));
}

export function marginPercent(netRevenueMmk: Numeric, costMmk: Numeric): Decimal {
  const revenue = dec(netRevenueMmk);
  if (revenue.isZero()) return new Decimal(0);
  return dec(revenue).minus(dec(costMmk)).div(revenue).mul(100);
}
