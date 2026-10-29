import { z } from "zod";
import { Decimal } from "./money";

const decimalString = (scale: number, max: string, label: string) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{1,13}(\\.\\d{1,${scale}})?$`),
      `${label} must be a positive number with at most ${scale} decimals`,
    )
    .refine((value) => {
      try {
        return new Decimal(value).lessThanOrEqualTo(max);
      } catch {
        return false;
      }
    }, `${label} is too large`);

export const currencySchema = z.enum(["MMK", "USD", "THB"]);
export const discountKindSchema = z.enum(["none", "percent", "amount"]);

export const lineInputSchema = z.object({
  productId: z.string().uuid().nullish(),
  sku: z.string().trim().max(64).nullish(),
  name: z.string().trim().min(1, "Description is required").max(300),
  description: z.string().trim().max(2000).nullish(),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  quantity: decimalString(3, "1000000", "Quantity"),
  unitPrice: decimalString(4, "1000000000", "Unit price"),
  discountPct: decimalString(3, "100", "Line discount").default("0"),
  taxRate: decimalString(5, "1", "Tax rate").default("0.05"),
  costUnitMmk: decimalString(2, "1000000000", "Cost").default("0"),
});

export const saveQuotationSchema = z
  .object({
    id: z.string().uuid().optional(),
    customerId: z.string().uuid("Select a customer"),
    projectTitle: z.string().trim().max(300).nullish(),
    subject: z.string().trim().max(300).nullish(),
    currency: currencySchema,
    discountKind: discountKindSchema,
    discountValue: decimalString(4, "1000000000", "Discount").default("0"),
    defaultTaxRate: decimalString(5, "1", "Tax rate").default("0.05"),
    validUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .nullish(),
    paymentTerms: z.string().trim().max(4000).nullish(),
    deliveryTerms: z.string().trim().max(4000).nullish(),
    warrantyTerms: z.string().trim().max(4000).nullish(),
    exclusions: z.string().trim().max(4000).nullish(),
    notes: z.string().trim().max(4000).nullish(),
    items: z.array(lineInputSchema).min(1, "Add at least one line").max(100),
    expectedUpdatedAt: z.string().datetime({ offset: true }).nullish(),
  })
  .strict();

export type SaveQuotationInput = z.infer<typeof saveQuotationSchema>;
export type LineInput = z.infer<typeof lineInputSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value ? value : null));

export const companySettingsSchema = z
  .object({
    legalName: z.string().trim().min(1, "Legal name is required").max(200),
    brandName: z.string().trim().min(1, "Brand name is required").max(200),
    tagline: optionalText(300),
    registrationNo: optionalText(100),
    taxId: optionalText(100),
    address: optionalText(2000),
    phone: optionalText(100),
    email: z
      .string()
      .trim()
      .max(200)
      .refine(
        (value) => value === "" || z.string().email().safeParse(value).success,
        "Enter a valid email address",
      )
      .transform((value) => (value ? value : null)),
    website: z
      .string()
      .trim()
      .max(300)
      .refine(
        (value) => value === "" || /^https?:\/\/\S+$/i.test(value),
        "Website must start with http:// or https://",
      )
      .transform((value) => (value ? value : null)),
    bankDetails: optionalText(4000),
    quotePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/, "Use letters, digits and hyphens, max 20"),
    defaultCurrency: currencySchema,
    defaultTaxPct: decimalString(3, "100", "Default tax"),
    taxLabel: z.string().trim().min(1, "Tax label is required").max(100),
    defaultValidityDays: z.coerce
      .number()
      .int("Validity must be a whole number of days")
      .min(1, "Validity must be at least 1 day")
      .max(365, "Validity cannot exceed 365 days"),
    defaultPaymentTerms: optionalText(4000),
    defaultDeliveryTerms: optionalText(4000),
    defaultWarrantyTerms: optionalText(4000),
    footerNote: optionalText(2000),
  })
  .strict();

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success,
    "Enter a valid email address",
  )
  .transform((value) => (value ? value : null));

const optionalDecimal = (scale: number, max: string, label: string) =>
  z.union([z.literal("").transform(() => null), decimalString(scale, max, label)]);

export const customerInputSchema = z
  .object({
    name: z.string().trim().min(1, "Customer name is required").max(200),
    attention: optionalText(200),
    taxId: optionalText(100),
    address: optionalText(2000),
    city: optionalText(100),
    country: z.string().trim().min(1, "Country is required").max(100),
    phone: optionalText(100),
    email: optionalEmail,
    defaultCurrency: currencySchema,
    notes: optionalText(4000),
    isActive: z.boolean(),
  })
  .strict();

export type CustomerInput = z.infer<typeof customerInputSchema>;

export const productInputSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z0-9][A-Z0-9._-]{0,63}$/,
        "Use letters, digits, dots, underscores and hyphens, max 64",
      ),
    name: z.string().trim().min(1, "Item name is required").max(300),
    description: optionalText(2000),
    category: optionalText(100),
    unit: z.string().trim().min(1, "Unit is required").max(20),
    costPriceMmk: decimalString(2, "1000000000", "Cost"),
    taxPct: decimalString(3, "100", "Tax rate"),
    priceMmk: decimalString(4, "1000000000", "MMK price"),
    priceUsd: optionalDecimal(4, "1000000000", "USD price"),
    priceThb: optionalDecimal(4, "1000000000", "THB price"),
    isActive: z.boolean(),
  })
  .strict();

export type ProductInput = z.infer<typeof productInputSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      code?: string;
      fieldErrors?: Record<string, string[]>;
    };
