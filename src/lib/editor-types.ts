export type EditorCustomer = {
  id: string;
  name: string;
  attention: string | null;
  address: string | null;
  city: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  defaultCurrency: string;
};

export type EditorProduct = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  costPriceMmk: string;
  taxRate: string;
  prices: Record<string, string>;
};

export type EditorLine = {
  key: string;
  productId: string | null;
  sku: string | null;
  name: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxPct: string;
};

export type EditorQuote = {
  id: string;
  quoteNo: string;
  revision: number;
  customerId: string;
  currency: string;
  projectTitle: string;
  subject: string;
  discountKind: "none" | "percent" | "amount";
  discountValue: string;
  defaultTaxPct: string;
  validUntil: string;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
  exclusions: string;
  notes: string;
  updatedAt: string;
  preparedBy: string | null;
  lines: EditorLine[];
};

export type EditorDefaults = {
  currency: string;
  taxPct: string;
  validUntil: string;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
  exclusions: string;
  notes: string;
};
