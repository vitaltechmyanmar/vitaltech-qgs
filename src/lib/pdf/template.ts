import type { CompanySettings } from "@/lib/db/schema";
import type { QuotationDetail } from "@/lib/db/queries";
import { formatDate, formatDecimal, formatMoney, quoteNumberLabel } from "@/lib/domain/format";

function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textBlock(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return escapeHtml(value.trim()).replace(/\n/g, "<br/>");
}

const STATUS_LABEL: Record<string, string> = {
  draft: "DRAFT — NOT YET ISSUED",
  sent: "QUOTATION",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
  expired: "EXPIRED",
  cancelled: "CANCELLED",
};

export async function buildQuotationHtml(
  detail: QuotationDetail,
  company: CompanySettings,
  fontCss: string,
): Promise<string> {
  const { quote, items } = detail;
  const customer = quote.customerSnapshot;
  const currency = quote.currency;
  const title = quoteNumberLabel(quote.quoteNo, quote.revision);
  const statusLabel = STATUS_LABEL[quote.status] ?? quote.status.toUpperCase();
  const isDraft = quote.status === "draft";

  const lineRows = items
    .map(
      (item, index) => `
        <tr>
          <td class="num">${index + 1}</td>
          <td>
            <div class="item-name mm">${escapeHtml(item.name)}</div>
            ${item.description ? `<div class="item-desc mm">${textBlock(item.description)}</div>` : ""}
            ${item.sku ? `<div class="sku">SKU ${escapeHtml(item.sku)}</div>` : ""}
          </td>
          <td class="num">${formatDecimal(item.quantity, 3)}<span class="unit">${escapeHtml(item.unit)}</span></td>
          <td class="num">${formatDecimal(item.unitPrice, 4)}</td>
          <td class="num">${formatDecimal(item.discountPct, 3)}%</td>
          <td class="num">${(Number(item.taxRate) * 100).toFixed(2)}%</td>
          <td class="num strong">${formatMoney(item.lineTotal ?? "0", currency)}</td>
        </tr>`,
    )
    .join("");

  const terms = [
    ["Payment terms", quote.paymentTerms],
    ["Delivery terms", quote.deliveryTerms],
    ["Warranty", quote.warrantyTerms],
    ["Exclusions", quote.exclusions],
    ["Notes", quote.notes],
  ].filter(([, value]) => Boolean(value && String(value).trim()));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    ${fontCss}

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Inter", "Noto Sans Myanmar", "Padauk", Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.5;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .content { position: relative; z-index: 1; }
    .mm { font-family: "Noto Sans Myanmar", "Padauk", "Inter", sans-serif; line-height: 1.8; }

    .watermark {
      position: fixed;
      inset: 30% 0 auto 0;
      text-align: center;
      font-size: 78pt;
      font-weight: 800;
      letter-spacing: 6px;
      color: rgba(11, 107, 203, 0.07);
      transform: rotate(-24deg);
      z-index: 0;
    }

    .top { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
    .brand { display: flex; gap: 12px; align-items: flex-start; }
    .mark {
      width: 42px; height: 42px; border-radius: 10px; background: #0b6bcb;
      color: #fff; font-weight: 800; font-size: 15pt;
      display: flex; align-items: center; justify-content: center;
    }
    .brand h1 { margin: 0; font-size: 15pt; letter-spacing: -0.2px; }
    .brand .tagline { margin: 2px 0 0; color: #475569; font-size: 8.5pt; }
    .company-meta { margin-top: 7px; color: #475569; font-size: 8.3pt; line-height: 1.5; }

    .doc-title { text-align: right; min-width: 190px; }
    .doc-title .label {
      font-size: 7.5pt; letter-spacing: 2px; text-transform: uppercase; color: #64748b;
    }
    .doc-title .number { font-size: 17pt; font-weight: 700; margin: 2px 0 1px; }
    .doc-title .rev { font-size: 8pt; color: #64748b; }
    .doc-title .status {
      margin-top: 7px; display: inline-block; padding: 3px 8px; border-radius: 999px;
      background: #eef7ff; color: #0959a8; font-size: 7.5pt; font-weight: 700;
      letter-spacing: 0.6px;
    }

    .rule { height: 3px; background: #0b6bcb; margin: 16px 0 14px; border-radius: 2px; }

    .meta { display: grid; grid-template-columns: 1.25fr 1fr; gap: 18px; }
    .block-title {
      font-size: 7.2pt; letter-spacing: 1.4px; text-transform: uppercase;
      color: #64748b; margin-bottom: 5px;
    }
    .customer-name { font-size: 11pt; font-weight: 700; margin-bottom: 3px; }
    .muted { color: #475569; }
    .meta-table { width: 100%; border-collapse: collapse; font-size: 8.8pt; }
    .meta-table td { padding: 2px 0; vertical-align: top; }
    .meta-table td:first-child { color: #64748b; width: 42%; }
    .meta-table td:last-child { text-align: right; font-weight: 600; }

    .subject {
      margin-top: 14px; padding: 8px 11px; border-left: 3px solid #0b6bcb;
      background: #f8fafc; font-size: 9.5pt;
    }

    table.items { width: 100%; border-collapse: collapse; margin-top: 14px; }
    table.items thead { display: table-header-group; }
    table.items th {
      background: #0f172a; color: #fff; font-size: 7.4pt; text-transform: uppercase;
      letter-spacing: 0.6px; padding: 6px 6px; text-align: left;
    }
    table.items td {
      border-bottom: 1px solid #e2e8f0; padding: 7px 6px; vertical-align: top;
    }
    table.items tr { break-inside: avoid; }
    .num { text-align: right; white-space: nowrap; }
    .strong { font-weight: 700; }
    .item-name { font-weight: 600; }
    .item-desc { color: #64748b; font-size: 8pt; margin-top: 2px; }
    .sku { color: #94a3b8; font-size: 7pt; margin-top: 2px; }
    .unit { color: #94a3b8; font-size: 7.5pt; margin-left: 3px; }

    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 12px; break-inside: avoid; }
    table.totals { width: 62%; border-collapse: collapse; font-size: 9pt; }
    table.totals td { padding: 4px 7px; }
    table.totals td:first-child { color: #64748b; white-space: nowrap; }
    table.totals td:last-child { text-align: right; font-weight: 600; white-space: nowrap; }
    table.totals tr.grand td {
      border-top: 2px solid #0f172a; padding-top: 7px; font-size: 11pt; font-weight: 700;
    }
    .mmk-note { text-align: right; color: #64748b; font-size: 8pt; margin-top: 3px; }

    .terms { margin-top: 18px; break-inside: avoid; }
    .terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 22px; }
    .term { font-size: 8.5pt; color: #334155; }
    .term .block-title { margin-bottom: 2px; }

    .bank { margin-top: 16px; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; }
    .bank .block-title { margin-bottom: 4px; }
    .bank p { margin: 0; font-size: 8.5pt; white-space: pre-line; }

    .sign { margin-top: 26px; display: flex; justify-content: space-between; gap: 40px; break-inside: avoid; }
    .sign-box { width: 46%; }
    .sign-line { border-top: 1px solid #94a3b8; margin-top: 42px; padding-top: 5px; font-size: 8pt; color: #64748b; }

    .footer-note { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 7.8pt; }
    .validity { margin-top: 10px; font-size: 8pt; color: #475569; }
  </style>
</head>
<body>
  ${isDraft ? '<div class="watermark">DRAFT</div>' : ""}
  <div class="content">
    <div class="top">
      <div class="brand">
        <div class="mark">VT</div>
        <div>
          <h1>${escapeHtml(company.brandName)}</h1>
          <p class="tagline mm">${escapeHtml(company.tagline)}</p>
          <div class="company-meta">
            ${company.address ? `<div class="mm">${textBlock(company.address)}</div>` : ""}
            ${[company.phone, company.email, company.website].filter(Boolean).map((value) => escapeHtml(value)).join(" · ")}
            ${company.taxId ? `<div>Tax ID: ${escapeHtml(company.taxId)}</div>` : ""}
            ${company.registrationNo ? `<div>Reg. No: ${escapeHtml(company.registrationNo)}</div>` : ""}
          </div>
        </div>
      </div>

      <div class="doc-title">
        <div class="label">Quotation</div>
        <div class="number">${escapeHtml(title)}</div>
        <div class="rev">Revision ${quote.revision} · ${formatDate(quote.createdAt)}</div>
        <div class="status">${escapeHtml(statusLabel)}</div>
      </div>
    </div>

    <div class="rule"></div>

    <div class="meta">
      <div>
        <div class="block-title">Prepared for</div>
        <div class="customer-name mm">${escapeHtml(customer.name)}</div>
        ${customer.attention ? `<div class="mm">Attn: ${escapeHtml(customer.attention)}</div>` : ""}
        <div class="muted mm">
          ${customer.address ? `${textBlock(customer.address)}<br/>` : ""}
          ${[customer.city, customer.country].filter(Boolean).map((value) => escapeHtml(value)).join(", ")}
          ${customer.phone ? `<br/>${escapeHtml(customer.phone)}` : ""}
          ${customer.email ? `<br/>${escapeHtml(customer.email)}` : ""}
          ${customer.taxId ? `<br/>Tax ID: ${escapeHtml(customer.taxId)}` : ""}
        </div>
      </div>

      <div>
        <div class="block-title">Quotation details</div>
        <table class="meta-table">
          <tr><td>Date</td><td>${formatDate(quote.createdAt)}</td></tr>
          <tr><td>Valid until</td><td>${formatDate(quote.validUntil)}</td></tr>
          <tr><td>Currency</td><td>${escapeHtml(currency)}</td></tr>
          ${currency !== "MMK" ? `<tr><td>Exchange rate</td><td>${formatDecimal(quote.fxRateMmkPerUnit, 8)} MMK / ${escapeHtml(currency)}</td></tr>` : ""}
          <tr><td>Project</td><td class="mm">${escapeHtml(quote.projectTitle || "—")}</td></tr>
        </table>
      </div>
    </div>

    ${quote.subject ? `<div class="subject mm"><strong>Subject:</strong> ${escapeHtml(quote.subject)}</div>` : ""}

    <table class="items">
      <thead>
        <tr>
          <th style="width:5%">#</th>
          <th style="width:42%">Description</th>
          <th style="width:10%" class="num">Qty</th>
          <th style="width:13%" class="num">Unit price</th>
          <th style="width:8%" class="num">Disc.</th>
          <th style="width:8%" class="num">Tax</th>
          <th style="width:14%" class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>

    <div class="totals-wrap">
      <div>
        <table class="totals">
          <tr><td>Subtotal</td><td>${formatMoney(quote.subtotal, currency)}</td></tr>
          ${Number(quote.discountTotal) > 0 ? `<tr><td>Discount</td><td>− ${formatMoney(quote.discountTotal, currency)}</td></tr>` : ""}
          <tr><td>${escapeHtml(company.taxLabel)}</td><td>${formatMoney(quote.vatTotal, currency)}</td></tr>
          <tr class="grand"><td>Total</td><td>${formatMoney(quote.grandTotal, currency)}</td></tr>
        </table>
        ${currency !== "MMK" ? `<div class="mmk-note">Equivalent at the frozen rate: ${formatMoney(quote.grandTotalMmk, "MMK")}</div>` : ""}
      </div>
    </div>

    ${terms.length > 0 ? `
      <div class="terms">
        <div class="block-title">Terms and conditions</div>
        <div class="terms-grid">
          ${terms.map(([label, value]) => `
            <div class="term">
              <div class="block-title">${escapeHtml(label)}</div>
              <div class="mm">${textBlock(value)}</div>
            </div>`).join("")}
        </div>
      </div>` : ""}

    ${company.bankDetails ? `
      <div class="bank">
        <div class="block-title">Bank details</div>
        <p class="mm">${textBlock(company.bankDetails)}</p>
      </div>` : ""}

    <div class="validity">
      This quotation is valid until <strong>${formatDate(quote.validUntil)}</strong>.
      Prices are exclusive of any taxes not shown above.
    </div>

    <div class="sign">
      <div class="sign-box">
        <div class="block-title">For ${escapeHtml(company.legalName)}</div>
        <div class="sign-line">Authorised signature</div>
      </div>
      <div class="sign-box">
        <div class="block-title">Accepted by ${escapeHtml(customer.name)}</div>
        <div class="sign-line">Name, signature and date</div>
      </div>
    </div>

    <div class="footer-note mm">
      ${company.footerNote ? textBlock(company.footerNote) : `${escapeHtml(company.legalName)} · ${escapeHtml(company.brandName)}`}
    </div>
  </div>
</body>
</html>`;
}
