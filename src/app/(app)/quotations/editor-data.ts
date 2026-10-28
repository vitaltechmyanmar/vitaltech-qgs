import { Decimal } from "@/lib/domain/money";
import type {
  EditorCustomer,
  EditorDefaults,
  EditorLine,
  EditorProduct,
  EditorQuote,
} from "@/lib/editor-types";
import type { QuotationDetail } from "@/lib/db/queries";
import {
  getCompanySettings,
  listCustomers,
  listLatestFxRates,
  listProductsWithPrices,
  yangonToday,
} from "@/lib/db/queries";

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function getEditorReference() {
  const [company, customers, products, rates] = await Promise.all([
    getCompanySettings(),
    listCustomers(true),
    listProductsWithPrices(true),
    listLatestFxRates(),
  ]);

  const fxRates: Record<string, string> = { MMK: "1" };
  for (const rate of rates) fxRates[rate.currency] = rate.mmkPerUnit;

  const defaults: EditorDefaults = {
    currency: company.defaultCurrency,
    taxPct: new Decimal(company.defaultTaxRate).mul(100).toString(),
    validUntil: addDays(yangonToday(), company.defaultValidityDays),
    paymentTerms: company.defaultPaymentTerms ?? "",
    deliveryTerms: company.defaultDeliveryTerms ?? "",
    warrantyTerms: company.defaultWarrantyTerms ?? "",
    exclusions: "",
    notes: "",
  };

  const editorCustomers: EditorCustomer[] = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    attention: customer.attention,
    address: customer.address,
    city: customer.city,
    country: customer.country,
    phone: customer.phone,
    email: customer.email,
    taxId: customer.taxId,
    defaultCurrency: customer.defaultCurrency,
  }));

  const editorProducts: EditorProduct[] = products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    costPriceMmk: product.costPriceMmk,
    taxRate: product.taxRate,
    prices: product.prices,
  }));

  return { company, editorCustomers, editorProducts, fxRates, defaults };
}

export function toEditorQuote(detail: QuotationDetail): EditorQuote {
  const { quote, items } = detail;
  const lines: EditorLine[] = items.map((item) => ({
    key: `item-${item.id}`,
    productId: item.productId,
    sku: item.sku,
    name: item.name,
    description: item.description ?? "",
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountPct: item.discountPct,
    taxPct: new Decimal(item.taxRate).mul(100).toString(),
  }));

  return {
    id: quote.id,
    quoteNo: quote.quoteNo,
    revision: quote.revision,
    customerId: quote.customerId,
    currency: quote.currency,
    projectTitle: quote.projectTitle ?? "",
    subject: quote.subject ?? "",
    discountKind: quote.discountKind,
    discountValue: quote.discountValue,
    defaultTaxPct: new Decimal(quote.defaultTaxRate).mul(100).toString(),
    validUntil: quote.validUntil ?? "",
    paymentTerms: quote.paymentTerms ?? "",
    deliveryTerms: quote.deliveryTerms ?? "",
    warrantyTerms: quote.warrantyTerms ?? "",
    exclusions: quote.exclusions ?? "",
    notes: quote.notes ?? "",
    updatedAt: quote.updatedAt.toISOString(),
    preparedBy: quote.preparedBy,
    lines,
  };
}
