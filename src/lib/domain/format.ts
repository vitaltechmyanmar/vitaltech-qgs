import { Numeric, dec } from "./money";

const numberFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Yangon",
});

export function formatMoney(value: Numeric, currency: string): string {
  // Values in this system stay well below Number.MAX_SAFE_INTEGER; formatting
  // only ever happens at the display boundary.
  return `${currency} ${numberFormat.format(dec(value).toNumber())}`;
}

export function formatNumber(value: Numeric, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(dec(value).toNumber());
}

/** Trims insignificant trailing zeros, e.g. 4500.00000000 → 4,500. */
export function formatDecimal(value: Numeric, maxDecimals = 4): string {
  const decimal = dec(value);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(maxDecimals, 8),
  }).format(decimal.toNumber());
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormat.format(date);
}

export function quoteNumberLabel(quoteNo: string, revision: number): string {
  return revision > 1 ? `${quoteNo} Rev ${revision}` : quoteNo;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
