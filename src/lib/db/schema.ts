import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "sales", "viewer"]);
export const quotationStatusEnum = pgEnum("quotation_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "cancelled",
]);
export const discountKindEnum = pgEnum("discount_kind", ["none", "percent", "amount"]);

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type QuotationStatus = (typeof quotationStatusEnum.enumValues)[number];
export type DiscountKind = (typeof discountKindEnum.enumValues)[number];

export type CustomerSnapshot = {
  name: string;
  attention: string | null;
  taxId: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull().default(""),
  role: userRoleEnum("role").notNull().default("sales"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companySettings = pgTable("company_settings", {
  id: smallint("id").primaryKey().default(1),
  legalName: text("legal_name").notNull(),
  brandName: text("brand_name").notNull(),
  tagline: text("tagline"),
  registrationNo: text("registration_no"),
  taxId: text("tax_id"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  logoKey: text("logo_key"),
  bankDetails: text("bank_details"),
  quotePrefix: text("quote_prefix").notNull().default("VT-Q"),
  defaultCurrency: text("default_currency").notNull().default("MMK"),
  defaultTaxRate: numeric("default_tax_rate", { precision: 6, scale: 5 })
    .notNull()
    .default("0.05"),
  taxLabel: text("tax_label").notNull().default("Commercial Tax"),
  defaultValidityDays: integer("default_validity_days").notNull().default(30),
  defaultPaymentTerms: text("default_payment_terms"),
  defaultDeliveryTerms: text("default_delivery_terms"),
  defaultWarrantyTerms: text("default_warranty_terms"),
  footerNote: text("footer_note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  attention: text("attention"),
  taxId: text("tax_id"),
  address: text("address"),
  city: text("city"),
  country: text("country").notNull().default("Myanmar"),
  phone: text("phone"),
  email: text("email"),
  defaultCurrency: text("default_currency").notNull().default("MMK"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  unit: text("unit").notNull().default("pcs"),
  costPriceMmk: numeric("cost_price_mmk", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  taxRate: numeric("tax_rate", { precision: 6, scale: 5 }).notNull().default("0.05"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productPrices = pgTable("product_prices", {
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  currency: text("currency").notNull(),
  unitPrice: numeric("unit_price", { precision: 18, scale: 4 }).notNull(),
});

export const exchangeRates = pgTable("exchange_rates", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  currency: text("currency").notNull(),
  mmkPerUnit: numeric("mmk_per_unit", { precision: 20, scale: 8 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  source: text("source").notNull().default("manual"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotations = pgTable("quotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteNo: text("quote_no").notNull(),
  revision: integer("revision").notNull().default(1),
  parentId: uuid("parent_id"),

  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  customerSnapshot: jsonb("customer_snapshot").$type<CustomerSnapshot>().notNull(),

  projectTitle: text("project_title"),
  subject: text("subject"),
  status: quotationStatusEnum("status").notNull().default("draft"),
  currency: text("currency").notNull().default("MMK"),

  fxRateMmkPerUnit: numeric("fx_rate_mmk_per_unit", { precision: 20, scale: 8 })
    .notNull()
    .default("1"),
  fxRateDate: date("fx_rate_date"),
  defaultTaxRate: numeric("default_tax_rate", { precision: 6, scale: 5 })
    .notNull()
    .default("0.05"),

  discountKind: discountKindEnum("discount_kind").notNull().default("none"),
  discountValue: numeric("discount_value", { precision: 18, scale: 4 })
    .notNull()
    .default("0"),

  subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull().default("0"),
  discountTotal: numeric("discount_total", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  vatTotal: numeric("vat_total", { precision: 18, scale: 2 }).notNull().default("0"),
  grandTotal: numeric("grand_total", { precision: 18, scale: 2 }).notNull().default("0"),

  subtotalMmk: numeric("subtotal_mmk", { precision: 18, scale: 2 }).notNull().default("0"),
  grandTotalMmk: numeric("grand_total_mmk", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  costTotalMmk: numeric("cost_total_mmk", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  marginMmk: numeric("margin_mmk", { precision: 18, scale: 2 }),

  validUntil: date("valid_until"),
  paymentTerms: text("payment_terms"),
  deliveryTerms: text("delivery_terms"),
  warrantyTerms: text("warranty_terms"),
  exclusions: text("exclusions"),
  notes: text("notes"),

  preparedBy: uuid("prepared_by").references(() => users.id),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),

  pdfKey: text("pdf_key"),
  pdfGeneratedAt: timestamp("pdf_generated_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotationItems = pgTable("quotation_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  quotationId: uuid("quotation_id")
    .notNull()
    .references(() => quotations.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  productId: uuid("product_id"),

  sku: text("sku"),
  name: text("name").notNull(),
  description: text("description"),
  unit: text("unit").notNull().default("pcs"),

  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 18, scale: 4 }).notNull(),
  discountPct: numeric("discount_pct", { precision: 6, scale: 3 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 6, scale: 5 }).notNull().default("0.05"),

  costUnitMmk: numeric("cost_unit_mmk", { precision: 18, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 18, scale: 2 }),
  costTotalMmk: numeric("cost_total_mmk", { precision: 18, scale: 2 }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotationEvents = pgTable("quotation_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  quotationId: uuid("quotation_id")
    .notNull()
    .references(() => quotations.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Quotation = typeof quotations.$inferSelect;
export type QuotationItem = typeof quotationItems.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type CompanySettings = typeof companySettings.$inferSelect;
