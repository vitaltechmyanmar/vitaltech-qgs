import { describe, expect, it } from "vitest";
import { companySettingsSchema } from "./schemas";

const base = {
  legalName: "VitalTech Myanmar Co., Ltd.",
  brandName: "VitalTech Myanmar",
  tagline: "",
  registrationNo: "",
  taxId: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  bankDetails: "",
  quotePrefix: "vt-q",
  defaultCurrency: "MMK",
  defaultTaxPct: "5",
  taxLabel: "Commercial Tax",
  defaultValidityDays: "30",
  defaultPaymentTerms: "",
  defaultDeliveryTerms: "",
  defaultWarrantyTerms: "",
  footerNote: "",
};

describe("companySettingsSchema", () => {
  it("normalises empty optional fields and the prefix", () => {
    const parsed = companySettingsSchema.parse(base);
    expect(parsed.quotePrefix).toBe("VT-Q");
    expect(parsed.email).toBeNull();
    expect(parsed.website).toBeNull();
    expect(parsed.bankDetails).toBeNull();
    expect(parsed.defaultValidityDays).toBe(30);
  });

  it("keeps a valid contact block", () => {
    const parsed = companySettingsSchema.parse({
      ...base,
      email: "sales@vitaltechmyanmar.com",
      website: "https://vitaltechmyanmar.com",
      defaultTaxPct: "7.5",
      defaultValidityDays: "45",
    });
    expect(parsed.email).toBe("sales@vitaltechmyanmar.com");
    expect(parsed.website).toBe("https://vitaltechmyanmar.com");
    expect(parsed.defaultTaxPct).toBe("7.5");
    expect(parsed.defaultValidityDays).toBe(45);
  });

  it("rejects invalid values", () => {
    expect(
      companySettingsSchema.safeParse({ ...base, email: "not-an-email" }).success,
    ).toBe(false);
    expect(
      companySettingsSchema.safeParse({ ...base, website: "vitaltechmyanmar.com" })
        .success,
    ).toBe(false);
    expect(
      companySettingsSchema.safeParse({ ...base, quotePrefix: "bad prefix!" }).success,
    ).toBe(false);
    expect(
      companySettingsSchema.safeParse({ ...base, defaultValidityDays: "0" }).success,
    ).toBe(false);
    expect(
      companySettingsSchema.safeParse({ ...base, defaultTaxPct: "150" }).success,
    ).toBe(false);
  });
});
