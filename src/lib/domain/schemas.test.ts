import { describe, expect, it } from "vitest";
import {
  companySettingsSchema,
  customerInputSchema,
  productInputSchema,
} from "./schemas";

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

const customerBase = {
  name: "Myanmar Aye Thar Yar Co., Ltd.",
  attention: "Daw Aye Chan",
  taxId: "MYA-998877665",
  address: "No. 45, Baho Road, Ahlone Township, Yangon",
  city: "Yangon",
  country: "Myanmar",
  phone: "+95 9 987 654 321",
  email: "",
  defaultCurrency: "USD",
  notes: "",
  isActive: true,
};

describe("customerInputSchema", () => {
  it("normalises optional fields and accepts a foreign-currency customer", () => {
    const parsed = customerInputSchema.parse(customerBase);
    expect(parsed.email).toBeNull();
    expect(parsed.notes).toBeNull();
    expect(parsed.defaultCurrency).toBe("USD");
    expect(parsed.country).toBe("Myanmar");
  });

  it("keeps a valid email and rejects bad contact data", () => {
    const parsed = customerInputSchema.parse({
      ...customerBase,
      email: "procurement@ayetharyar.example",
    });
    expect(parsed.email).toBe("procurement@ayetharyar.example");

    expect(
      customerInputSchema.safeParse({ ...customerBase, email: "not-an-email" }).success,
    ).toBe(false);
    expect(customerInputSchema.safeParse({ ...customerBase, name: " " }).success).toBe(
      false,
    );
    expect(
      customerInputSchema.safeParse({ ...customerBase, defaultCurrency: "EUR" }).success,
    ).toBe(false);
  });
});

const productBase = {
  sku: "vt-sw-9200",
  name: "Cisco Catalyst 9200 24-Port Switch",
  description: "24-port PoE+ managed switch.",
  category: "Network",
  unit: "pcs",
  costPriceMmk: "2100000",
  taxPct: "5",
  priceMmk: "3200000",
  priceUsd: "745",
  priceThb: "",
  isActive: true,
};

describe("productInputSchema", () => {
  it("uppercases the SKU and allows blank optional currency prices", () => {
    const parsed = productInputSchema.parse(productBase);
    expect(parsed.sku).toBe("VT-SW-9200");
    expect(parsed.priceThb).toBeNull();
    expect(parsed.priceUsd).toBe("745");
  });

  it("requires an MMK price and rejects invalid amounts", () => {
    expect(
      productInputSchema.safeParse({ ...productBase, priceMmk: "" }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({ ...productBase, sku: "bad sku!" }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({ ...productBase, taxPct: "150" }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({ ...productBase, costPriceMmk: "1.999" }).success,
    ).toBe(false);
  });
});
