import { describe, expect, it } from "vitest";
import { Decimal } from "./money";
import { computeMarginMmk, computeTotals, marginPercent } from "./pricing";

const workedExample = computeTotals(
  [
    { quantity: "4", unitPrice: "250.00", discountPct: "0", taxRate: "0.05" },
    { quantity: "10", unitPrice: "45.50", discountPct: "10", taxRate: "0.05" },
  ],
  "percent",
  "2",
);

describe("computeTotals — worked example from docs/03", () => {
  it("matches every published number", () => {
    expect(workedExample.lines[0].lineTotal.toFixed(2)).toBe("1000.00");
    expect(workedExample.lines[1].lineTotal.toFixed(2)).toBe("409.50");
    expect(workedExample.subtotal.toFixed(2)).toBe("1409.50");
    expect(workedExample.discountTotal.toFixed(2)).toBe("28.19");
    expect(workedExample.lines[0].taxBase.toFixed(2)).toBe("980.00");
    expect(workedExample.lines[1].taxBase.toFixed(2)).toBe("401.31");
    expect(workedExample.lines[0].tax.toFixed(2)).toBe("49.00");
    expect(workedExample.lines[1].tax.toFixed(2)).toBe("20.07");
    expect(workedExample.vatTotal.toFixed(2)).toBe("69.07");
    expect(workedExample.grandTotal.toFixed(2)).toBe("1450.38");
  });

  it("computes the MMK equivalent and margin", () => {
    expect(workedExample.grandTotal.mul(4500).toFixed(2)).toBe("6526710.00");
    expect(
      computeMarginMmk(workedExample, "4500", "1180000").toFixed(2),
    ).toBe("5035895.00");
  });

  it("derives the published margin percentage", () => {
    const netRevenue = workedExample.subtotal
      .minus(workedExample.discountTotal)
      .mul(4500);
    expect(marginPercent(netRevenue, "1180000").toFixed(1)).toBe("81.0");
  });
});

describe("computeTotals — edges", () => {
  it("caps an amount discount at the subtotal", () => {
    const totals = computeTotals(
      [{ quantity: "1", unitPrice: "100", discountPct: "0", taxRate: "0.05" }],
      "amount",
      "500",
    );
    expect(totals.discountTotal.toFixed(2)).toBe("100.00");
    expect(totals.vatTotal.toFixed(2)).toBe("0.00");
    expect(totals.grandTotal.toFixed(2)).toBe("0.00");
  });

  it("clamps a percent discount to 100%", () => {
    const totals = computeTotals(
      [{ quantity: "1", unitPrice: "100", discountPct: "0", taxRate: "0.05" }],
      "percent",
      "140",
    );
    expect(totals.discountTotal.toFixed(2)).toBe("100.00");
    expect(totals.grandTotal.toFixed(2)).toBe("0.00");
  });

  it("handles an empty quote without dividing by zero", () => {
    const totals = computeTotals([], "percent", "10");
    expect(totals.subtotal.toFixed(2)).toBe("0.00");
    expect(totals.discountTotal.toFixed(2)).toBe("0.00");
    expect(totals.vatTotal.toFixed(2)).toBe("0.00");
    expect(totals.grandTotal.toFixed(2)).toBe("0.00");
  });

  it("rounds each line before summing", () => {
    // 3 × 0.335 = 1.005 -> 1.01; two such lines must sum to 2.02, not 2.01.
    const totals = computeTotals(
      [
        { quantity: "3", unitPrice: "0.335", discountPct: "0", taxRate: "0" },
        { quantity: "3", unitPrice: "0.335", discountPct: "0", taxRate: "0" },
      ],
      "none",
      "0",
    );
    expect(totals.lines[0].lineTotal.toFixed(2)).toBe("1.01");
    expect(totals.subtotal.toFixed(2)).toBe("2.02");
  });

  it("clamps a line discount above 100%", () => {
    const totals = computeTotals(
      [{ quantity: "1", unitPrice: "100", discountPct: "150", taxRate: "0" }],
      "none",
      "0",
    );
    expect(totals.lines[0].lineTotal.toFixed(2)).toBe("0.00");
  });

  it("uses half-up rounding, matching PostgreSQL", () => {
    const totals = computeTotals(
      [{ quantity: "1", unitPrice: "2.345", discountPct: "0", taxRate: "0" }],
      "none",
      "0",
    );
    expect(totals.subtotal.toFixed(2)).toBe("2.35");
  });

  it("keeps tax on each line after pro-rata discount allocation", () => {
    const totals = computeTotals(
      [
        { quantity: "1", unitPrice: "100", discountPct: "0", taxRate: "0.05" },
        { quantity: "1", unitPrice: "100", discountPct: "0", taxRate: "0" },
      ],
      "percent",
      "10",
    );
    // Each line gets 10.00 of the discount; only the taxed line pays 4.50.
    expect(totals.lines[0].taxBase.toFixed(2)).toBe("90.00");
    expect(totals.lines[1].taxBase.toFixed(2)).toBe("90.00");
    expect(totals.vatTotal.toFixed(2)).toBe("4.50");
  });

  it("treats a 0% header discount as zero", () => {
    const totals = computeTotals(
      [{ quantity: "2", unitPrice: "10", discountPct: "0", taxRate: "0.05" }],
      "percent",
      "0",
    );
    expect(totals.discountTotal.toFixed(2)).toBe("0.00");
    expect(totals.grandTotal.toFixed(2)).toBe("21.00");
  });

  it("does not mutate the input values", () => {
    const quantity = new Decimal("4");
    computeTotals(
      [{ quantity, unitPrice: "250", discountPct: "0", taxRate: "0" }],
      "none",
      "0",
    );
    expect(quantity.toString()).toBe("4");
  });
});
