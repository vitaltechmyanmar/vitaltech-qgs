import { describe, expect, it } from "vitest";
import { parseFxProviderPayload } from "./fx-provider";

describe("parseFxProviderPayload", () => {
  it("converts a USD-based open feed to MMK per unit", () => {
    const parsed = parseFxProviderPayload({
      result: "success",
      base_code: "USD",
      rates: { USD: 1, THB: 33.772379, MMK: 2097.533322 },
    });

    expect(parsed.rates.USD).toBeCloseTo(2097.533322, 6);
    expect(parsed.rates.THB).toBeCloseTo(2097.533322 / 33.772379, 6);
    expect(parsed.rates.THB).toBeCloseTo(62.107953, 5);
  });

  it("accepts the direct MMK-per-unit provider shape", () => {
    const parsed = parseFxProviderPayload({
      date: "2026-10-28",
      rates: { USD: 4500, THB: 125 },
    });

    expect(parsed).toEqual({
      effectiveDate: "2026-10-28",
      rates: { USD: 4500, THB: 125 },
    });
  });

  it("ignores malformed dates and rejects missing rates", () => {
    const parsed = parseFxProviderPayload({
      date: "28/10/2026",
      base_code: "USD",
      rates: { USD: 1, THB: 33, MMK: 2100 },
    });
    expect(parsed.effectiveDate).toBeUndefined();

    expect(() => parseFxProviderPayload({ rates: {} })).toThrow();
    expect(() =>
      parseFxProviderPayload({ base_code: "USD", rates: { USD: 1, MMK: 2100 } }),
    ).toThrow();
    expect(() =>
      parseFxProviderPayload({ result: "error", "error-type": "quota" }),
    ).toThrow(/quota/);
  });
});
