import { and, asc, desc, eq, ilike, lte, or, sql } from "drizzle-orm";
import { getDb } from "./index";
import {
  companySettings,
  customers,
  exchangeRates,
  productPrices,
  products,
  quotationEvents,
  quotationItems,
  quotations,
  type CompanySettings,
  type Customer,
  type Product,
  type Quotation,
  type QuotationItem,
  type QuotationStatus,
} from "./schema";

export function yangonToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const DEFAULT_COMPANY: CompanySettings = {
  id: 1,
  legalName: "VitalTech Myanmar Co., Ltd.",
  brandName: "VitalTech Myanmar",
  tagline: "System integration · IT infrastructure · Managed services",
  registrationNo: null,
  taxId: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  logoKey: null,
  bankDetails: null,
  quotePrefix: "VT-Q",
  defaultCurrency: "MMK",
  defaultTaxRate: "0.05",
  taxLabel: "Commercial Tax",
  defaultValidityDays: 30,
  defaultPaymentTerms: null,
  defaultDeliveryTerms: null,
  defaultWarrantyTerms: null,
  footerNote: null,
  updatedAt: new Date(0),
};

export async function getCompanySettings(): Promise<CompanySettings> {
  const [row] = await getDb()
    .select()
    .from(companySettings)
    .where(eq(companySettings.id, 1))
    .limit(1);
  return row ?? DEFAULT_COMPANY;
}

export type QuotationListRow = {
  id: string;
  quoteNo: string;
  revision: number;
  projectTitle: string | null;
  subject: string | null;
  status: QuotationStatus;
  currency: string;
  grandTotal: string;
  grandTotalMmk: string;
  validUntil: string | null;
  createdAt: Date;
  customerName: string;
};

export async function listQuotations(filters: {
  status?: QuotationStatus;
  q?: string;
  limit?: number;
}): Promise<QuotationListRow[]> {
  const db = getDb();
  const where = [];

  if (filters.status) where.push(eq(quotations.status, filters.status));
  if (filters.q?.trim()) {
    const needle = `%${filters.q.trim()}%`;
    where.push(
      or(
        ilike(quotations.quoteNo, needle),
        ilike(quotations.projectTitle, needle),
        ilike(quotations.subject, needle),
        sql`${quotations.customerSnapshot}->>'name' ilike ${needle}`,
      )!,
    );
  }

  return db
    .select({
      id: quotations.id,
      quoteNo: quotations.quoteNo,
      revision: quotations.revision,
      projectTitle: quotations.projectTitle,
      subject: quotations.subject,
      status: quotations.status,
      currency: quotations.currency,
      grandTotal: quotations.grandTotal,
      grandTotalMmk: quotations.grandTotalMmk,
      validUntil: quotations.validUntil,
      createdAt: quotations.createdAt,
      customerName: sql<string>`${quotations.customerSnapshot}->>'name'`,
    })
    .from(quotations)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(quotations.createdAt), desc(quotations.id))
    .limit(filters.limit ?? 100);
}

export type QuotationDetail = {
  quote: Quotation;
  items: QuotationItem[];
  events: {
    id: number;
    eventType: string;
    actorId: string | null;
    details: Record<string, unknown>;
    createdAt: Date;
  }[];
};

export async function getQuotationDetail(id: string): Promise<QuotationDetail | null> {
  const db = getDb();
  const [quote] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
  if (!quote) return null;

  const [items, events] = await Promise.all([
    db
      .select()
      .from(quotationItems)
      .where(eq(quotationItems.quotationId, id))
      .orderBy(asc(quotationItems.position), asc(quotationItems.createdAt)),
    db
      .select({
        id: quotationEvents.id,
        eventType: quotationEvents.eventType,
        actorId: quotationEvents.actorId,
        details: quotationEvents.details,
        createdAt: quotationEvents.createdAt,
      })
      .from(quotationEvents)
      .where(eq(quotationEvents.quotationId, id))
      .orderBy(desc(quotationEvents.createdAt))
      .limit(50),
  ]);

  return {
    quote,
    items,
    events: events.map((event) => ({
      id: Number(event.id),
      eventType: event.eventType,
      actorId: event.actorId,
      details: (event.details ?? {}) as Record<string, unknown>,
      createdAt: event.createdAt,
    })),
  };
}

export async function listCustomers(activeOnly = true): Promise<Customer[]> {
  return getDb()
    .select()
    .from(customers)
    .where(activeOnly ? eq(customers.isActive, true) : undefined)
    .orderBy(asc(customers.name))
    .limit(500);
}

export type ProductWithPrices = Product & { prices: Record<string, string> };

export async function listProductsWithPrices(activeOnly = true): Promise<ProductWithPrices[]> {
  const db = getDb();
  const [rows, prices] = await Promise.all([
    db
      .select()
      .from(products)
      .where(activeOnly ? eq(products.isActive, true) : undefined)
      .orderBy(asc(products.category), asc(products.name)),
    db.select().from(productPrices),
  ]);

  const byProduct = new Map<string, Record<string, string>>();
  for (const price of prices) {
    const current = byProduct.get(price.productId) ?? {};
    current[price.currency] = price.unitPrice;
    byProduct.set(price.productId, current);
  }

  return rows.map((product) => ({ ...product, prices: byProduct.get(product.id) ?? {} }));
}

export async function getLatestFxRate(currency: string): Promise<{
  currency: string;
  mmkPerUnit: string;
  effectiveDate: string;
  source: string;
} | null> {
  if (currency === "MMK") {
    return { currency: "MMK", mmkPerUnit: "1", effectiveDate: yangonToday(), source: "fixed" };
  }

  const [row] = await getDb()
    .select({
      currency: exchangeRates.currency,
      mmkPerUnit: exchangeRates.mmkPerUnit,
      effectiveDate: exchangeRates.effectiveDate,
      source: exchangeRates.source,
    })
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.currency, currency),
        lte(exchangeRates.effectiveDate, yangonToday()),
      ),
    )
    .orderBy(desc(exchangeRates.effectiveDate), desc(exchangeRates.id))
    .limit(1);

  return row ?? null;
}

export type FxRateRow = {
  currency: string;
  mmkPerUnit: string;
  effectiveDate: string;
  source: string;
  note: string | null;
  createdAt: Date;
};

/** Latest row per currency, using DISTINCT ON (portable across PG 16). */
export async function listLatestFxRates(): Promise<FxRateRow[]> {
  const result = await getDb().execute(sql`
    select distinct on (currency)
      currency, mmk_per_unit as "mmkPerUnit", effective_date as "effectiveDate",
      source, note, created_at as "createdAt"
    from exchange_rates
    order by currency, effective_date desc, id desc
  `);
  return result.rows as unknown as FxRateRow[];
}

export type MonthlySalesRow = {
  month: string;
  quotesCreated: number;
  quotesIssued: number;
  quotesWon: number;
  quotedMmk: string;
  wonMmk: string;
};

export type PipelineRow = {
  status: QuotationStatus;
  quoteCount: number;
  valueMmk: string;
  avgValueMmk: string;
};

export type ProductPerformanceRow = {
  productKey: string;
  sku: string | null;
  name: string;
  quoteCount: number;
  quantitySold: string;
  revenueMmk: string;
  costMmk: string;
  marginMmk: string;
};

export async function getReportData(): Promise<{
  monthly: MonthlySalesRow[];
  pipeline: PipelineRow[];
  products: ProductPerformanceRow[];
}> {
  const db = getDb();
  const [monthly, pipeline, productRows] = await Promise.all([
    db.execute(sql`
      select
        to_char(month, 'YYYY-MM') as "month",
        quotes_created as "quotesCreated",
        quotes_issued as "quotesIssued",
        quotes_won as "quotesWon",
        quoted_mmk as "quotedMmk",
        won_mmk as "wonMmk"
      from v_monthly_sales
      order by month desc
      limit 12
    `),
    db.execute(sql`
      select status, quote_count as "quoteCount", value_mmk as "valueMmk",
             avg_value_mmk as "avgValueMmk"
      from v_pipeline
      order by value_mmk desc
    `),
    db.execute(sql`
      select product_key as "productKey", sku, name, quote_count as "quoteCount",
             quantity_sold as "quantitySold", revenue_mmk as "revenueMmk",
             cost_mmk as "costMmk", margin_mmk as "marginMmk"
      from v_product_performance
      order by revenue_mmk desc
      limit 20
    `),
  ]);

  return {
    monthly: monthly.rows as unknown as MonthlySalesRow[],
    pipeline: pipeline.rows as unknown as PipelineRow[],
    products: productRows.rows as unknown as ProductPerformanceRow[],
  };
}

export async function getStatusCounts(): Promise<Record<string, number>> {
  const rows = await getDb()
    .select({ status: quotations.status, count: sql<number>`count(*)::int` })
    .from(quotations)
    .groupBy(quotations.status);
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}
