# 03 — Pricing, Currency, and Numbering

This is the part of the system that must be provably correct. All formulas below are
implemented in two places that must agree:

1. `src/lib/domain/pricing.ts` — pure TypeScript for the live editor preview.
2. `recalc_quotation_totals()` in PostgreSQL — authoritative stored values.

Unit tests assert both produce identical results for the same fixture set.

## 1. Money representation

| Value | Storage | TypeScript |
|---|---|---|
| Unit price | `numeric(18,4)` | `Decimal` (decimal.js) |
| Quantity | `numeric(14,3)` | `Decimal` |
| Line / header totals | `numeric(18,2)` | `Decimal` |
| FX rate | `numeric(20,8)` | `Decimal` |
| Tax rate | `numeric(6,5)` (0.05 = 5%) | `Decimal` |

Rules:

- Never use `number` for money. Convert at the boundary: strings from the DB,
  `Decimal` in domain code, formatted strings in the UI.
- Rounding is **half-up at 2 decimals** (`ROUND_HALF_UP`), matching Postgres
  `round(numeric, 2)` for positive amounts.
- Line totals are rounded before summing; the sum is not re-rounded.
- VAT is computed per line after discount allocation, then summed. This can differ
  from "tax on invoice total" by a few cents — the PDF shows the sum, and that is the
  number that matters.

## 2. Line-level formulas

For item *i* (all in quotation currency):

```
gross_i      = quantity_i × unit_price_i
line_total_i = round(gross_i × (1 − line_discount_pct_i / 100), 2)
```

The stored `line_total` is a generated column, so it cannot drift.

Cost (always MMK):

```
cost_total_i = round(quantity_i × cost_unit_mmk_i, 2)
```

## 3. Header discount

```
subtotal      = Σ line_total_i
discount_total = round(subtotal × pct / 100, 2)      if kind = percent
               = min(round(amount, 2), subtotal)      if kind = amount
               = 0                                    if kind = none
```

The header discount is **not** applied per line in the database, but it must be
allocated to lines for tax purposes.

## 4. Tax (Myanmar commercial tax)

The label on the PDF comes from `company_settings` ("Commercial Tax" by default,
"VAT" acceptable). The MVP default rate is 5%, and each line snapshots its own rate
so zero-rated or exempt lines are possible.

Allocation of the header discount is pro-rata by line value:

```
share_i    = line_total_i / subtotal            (0 when subtotal = 0)
tax_base_i = line_total_i − discount_total × share_i
line_tax_i = round(tax_base_i × tax_rate_i, 2)
vat_total  = Σ line_tax_i
```

```
grand_total = subtotal − discount_total + vat_total
```

## 5. Currency and FX

Base currency is **MMK**. A quotation is priced in exactly one currency.

```
fx_rate_mmk_per_unit = MMK per 1 unit of quote currency   (USD → ~4,500)
subtotal_mmk         = round(subtotal × fx_rate, 2)
grand_total_mmk      = round(grand_total × fx_rate, 2)
margin_mmk           = round((subtotal − discount_total) × fx_rate, 2) − cost_total_mmk
```

- The rate is **frozen at quote creation** (`fx_rate_date` = date of the rate used).
  Creating a revision re-reads the current rate and stores it on the new revision.
- `MMK` quotes always store `fx_rate = 1`.
- Rate lookup: newest `exchange_rates` row with `effective_date <= quote date`;
  the daily sync pulls from open.er-api.com (or `FX_PROVIDER_URL`). A manual
  entry form is still pending; manual rows are respected and never overwritten
  by the cron.
- Foreign quotes without a rate are blocked at save time.
- The PDF shows the quote in its own currency, plus a small line:
  "MMK equivalent at 1 USD = 4,500 MMK (28 Oct 2026)".
- Reports and dashboards aggregate in MMK using each quote's stored rate — never
  today's rate.

## 6. Worked example

Quote in **USD**, FX `1 USD = 4,500 MMK`, header discount 2%.

| Line | Qty | Unit price | Line disc. | Line total | Cost/unit (MMK) | Cost total (MMK) |
|---|---|---|---|---|---|---|
| A — CCTV controller | 4 | 250.00 | 0% | **1,000.00** | 200,000 | 800,000 |
| B — Installation labour | 10 | 45.50 | 10% | **409.50** | 38,000 | 380,000 |
| | | | | **1,409.50** | | **1,180,000** |

```
discount_total = round(1,409.50 × 2%)           = 28.19
A: tax base    = 1,000.00 − 28.19 × (1,000.00 / 1,409.50) = 980.00 → tax 49.00
B: tax base    =   409.50 − 28.19 × (  409.50 / 1,409.50) = 401.31 → tax 20.07
vat_total      = 69.07
grand_total    = 1,409.50 − 28.19 + 69.07        = 1,450.38 USD
grand_total_mmk= 1,450.38 × 4,500                = 6,526,710.00 MMK
net revenue    = (1,409.50 − 28.19) × 4,500       = 6,215,895.00 MMK
margin_mmk     = 6,215,895.00 − 1,180,000.00     = 5,035,895.00 MMK (81.0%)
```

Acceptance test: these exact numbers appear in the Vitest fixture and in the PDF
snapshot.

## 7. Guardrails

Not a full approval workflow (Phase 2), but the MVP must not silently lose money:

| Condition | Behaviour |
|---|---|
| Margin < 15% | Amber warning in the editor and on the quote page |
| Margin < 0% | Red warning; requires admin role to save |
| Line price below cost | Warning on that line, with the cost shown to sales |
| Header discount > 15% | Requires admin to save |
| Quote total = 0 | Blocked unless status is `draft` and the quote has the note "sample" |

Thresholds live in `company_settings` later; for MVP they are constants in
`lib/domain/guardrails.ts` so they are testable.

## 8. Numbering

Format: `VT-Q-2026-0001`, where:

- `VT-Q` is `company_settings.quote_prefix` (configurable).
- `2026` is the year in **Asia/Yangon**, not UTC (a quote created 00:30 on 1 Jan
  Yangon must not be numbered in the previous year).
- `0001` is a zero-padded counter that resets each year.

Implementation:

```sql
select next_doc_no('quotation', 'VT-Q', to_char(now() at time zone 'Asia/Yangon', 'YYYY'));
-- → VT-Q-2026-0001
```

`next_doc_no()` performs a single atomic upsert on `doc_counters`, so two concurrent
saves can never receive the same number (no `MAX()+1`, no advisory lock needed).

Revisions share the root number:

| revision | Display | `quote_no` | `parent_id` |
|---|---|---|---|
| 1 | VT-Q-2026-0001 | VT-Q-2026-0001 | null |
| 2 | VT-Q-2026-0001 Rev 2 | VT-Q-2026-0001 | Rev 1 id |
| 3 | VT-Q-2026-0001 Rev 3 | VT-Q-2026-0001 | Rev 1 id |

The PDF filename is `VT-Q-2026-0001-r2.pdf`; the S3 key also carries the template
version, e.g. `quotes/2026/VT-Q-2026-0001-r2-t3.pdf`.

## 9. Validity and expiry

- Default validity: `company_settings.default_validity_days` (30), pre-filled in the
  editor as today + 30 days and adjustable while `draft`; the PDF prints the concrete
  `valid_until` date.
- The daily sweep marks `sent` quotes with `valid_until < today (Yangon)` as
  `expired`. It never touches `accepted` or `rejected`.
- Editing `valid_until` is allowed in `draft` only.
- The PDF prints "Valid until 27 Nov 2026" and, when expired, a watermark/notice.

## 10. Formatting rules (UI and PDF)

| Item | Rule |
|---|---|
| Numbers | `Intl.NumberFormat('en-US')`, thousands separators, 2 decimals |
| Currency | `MMK 6,526,710.00` / `USD 1,450.38` (code first, no ambiguous symbols) |
| Dates | `28 Oct 2026` in English; Burmese optional later via `my-MM` |
| Negative margins | Parentheses in reports, red in the editor |
| Rounding display | Never show more than 2 decimals for amounts, 2 for percentages |
| Burmese text | Unicode only; detect Zawgyi on input and warn before saving |

Do not use `my-MM` for **numbers** by default — Burmese digits and grouping confuse
mixed-language business documents. Burmese labels plus Latin numerals is the norm.
