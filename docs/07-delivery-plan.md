# 07 — Delivery Plan

## 1. Shape of the work

One full-stack developer can deliver the MVP in **7–9 weeks**, with a part-time
reviewer for design/PDF sign-off and a sales lead for UAT. The PDF and Myanmar font
spike is deliberately first — it is the highest-risk item and it shapes the stack.

| Phase | Duration | Outcome |
|---|---|---|
| 0 — Spike and foundation | 1 week | PDF + Burmese proven, repo/CI/infra up, login works |
| 1 — Master data | 1.5 weeks | Customers, products, prices, FX, settings |
| 2 — Quotation editor and totals | 2.5 weeks | Create/save/edit drafts, correct totals, preview |
| 3 — PDF and lifecycle | 1.5 weeks | Branded PDF, send/accept/reject, revisions |
| 4 — Reports and hardening | 1 week | Dashboard, exports, audit, alarms, backup drill |
| 5 — UAT and go-live | 1 week | Sign-off, data import, training, cutover |

Calendar estimate with review cycles: **8–9 weeks**.

## 2. Implementation status

| Phase | Status | Notes |
|---|---|---|
| 0 — Spike and foundation | **Done** | PDF + Burmese fonts proven; repo, migrations, auth, CI, Docker images, nginx edge in place |
| 1 — Master data | **Partial** | Company profile is editable and FX pulls from the open feed; catalog, customers and user administration are still read-only/seed-only |
| 2 — Quotation editor and totals | **Done** | Live totals, DB-authoritative triggers, optimistic locking, guardrails, list filters |
| 3 — PDF and lifecycle | **Done (S3 cache deferred)** | On-demand branded PDF, status transitions, revisions, expiry sweep; PDFs are not persisted to S3 yet |
| 4 — Reports and hardening | **Partial** | Monthly/pipeline/product reports and audit events exist; CSV export, alarms, and the restore drill remain |
| 5 — UAT and go-live | **Not started** | Requires the real catalog import, users, DNS, and production secrets |

S3 PDF caching, CSV export, admin CRUD forms, and the AWS rollout are the
remaining MVP-adjacent items. Everything currently in the repo has been run
against PostgreSQL 16 and exercised in a browser; see the README validation
section for the exact checks.

## 3. Phase detail

### Phase 0 — Spike and foundation (week 1)

- Render two sample quotes (1 page and 3 pages) in Chromium with Noto Sans Myanmar and
  Padauk; check kinzi, stacked vowels, mixed Burmese/English tables.
- Decide font set and template versioning; record result in the repo.
- Provision VPC, RDS (staging), EC2, S3 bucket, ECR, Secrets Manager, CloudWatch.
- Next.js 15 scaffold, Drizzle, Auth.js, `requireRole`, login + forced password change.
- GitHub Actions: typecheck, lint, test, build, image push, staging deploy.
- Apply `0001_init.sql` to staging.

**Exit criteria:** a staff user can log in on staging; a hard-coded quote renders a
correct Burmese PDF; CI deploys on merge.

### Phase 1 — Master data (weeks 2–3)

- Customers: list/search/create/edit/deactivate.
- Products: SKU, description, unit, cost, tax rate, prices in MMK/USD/THB.
- Exchange rates: history list, manual entry, daily provider sync + cron secret.
- Company settings: letterhead fields, logo upload, defaults.
- Users: invite, role change, reset password, deactivate (admin).
- Seed script: company settings, first admin, ~20 real catalog items.

**Exit criteria:** sales can build a catalog and a customer list without SQL.

### Phase 2 — Quotation editor and totals (weeks 3–5)

- Quote list with filters, keyset pagination, pipeline totals strip.
- Editor: customer picker, currency, item rows (catalog search or free text), line
  discounts, header discount, per-line tax, terms, validity.
- Live totals in the browser; server recalculation on save; optimistic locking.
- Guardrail warnings (margin, discount), admin override.
- Preview page using the exact PDF HTML/CSS.
- Unit tests: pricing fixtures (including the worked example in doc 03), rounding,
  FX conversion, percent/amount discounts, zero-subtotal.
- Trigger tests: direct SQL inserts still produce correct totals.

**Exit criteria:** totals in the UI, DB, and preview always match for the fixture set;
two editors cannot silently overwrite each other.

### Phase 3 — PDF and lifecycle (weeks 5–6)

- PDF route with S3 caching, presigned redirects, inline/attachment modes.
- Revision flow, status transitions, timestamps, event timeline.
- Expiry sweep cron.
- Visual snapshot tests + `pdftotext` assertions.
- Accessibility pass: keyboard nav, labels, focus states.

**Exit criteria:** every quote state produces the right PDF (draft watermark, expiry
notice, revision label); PDF regenerates after edits and stays cached otherwise.

### Phase 4 — Reports and hardening (week 7)

- Reports: monthly quoted/won value (MMK), win rate, pipeline by status, product
  performance, margin distribution.
- CSV export of quotes and lines.
- Audit review, error pages, empty states, loading states.
- Alarms, dashboards, log retention, backup restore drill.
- Performance pass: list p95, save p95, PDF warm/cold.

**Exit criteria:** numbers reconcile against a manual spreadsheet for one month of
historical quotes; restore drill completed.

### Phase 5 — UAT and go-live (week 8)

- Import customers/products from the current spreadsheets (one-off script, reviewed).
- Enter 5 real historical quotes and compare PDFs to the old Word versions.
- Train 3–5 users (30–45 min), write a one-page cheat sheet.
- Cutover: production RDS, production secrets, DNS, final backup, freeze spreadsheets.
- Two-week hypercare: daily log review, fast turnaround on wording/layout changes.

**Exit criteria:** sales complete one real quote end-to-end without help; sign-off from
the business owner.

## 4. Acceptance criteria (MVP)

Functional:

- Create a quote in MMK, USD, or THB with catalog and free-text lines.
- Line and header discounts, per-line tax, correct rounding, MMK equivalents.
- Branded PDF with Burmese and English text, correct page breaks and totals.
- Send/accept/reject/expire, revisions preserve history, audit trail complete.
- Catalog with three-currency prices and cost-based margin warnings.
- Reports reconcile with quote data; CSV export works.
- Roles enforced: viewer cannot edit or see cost/margin.

Non-functional:

- Save a 30-line quote in < 500 ms p95; list page < 800 ms p95; warm PDF < 3 s.
- Nightly backups verified; restore drill passed.
- No secrets in the image or repository; least-privilege DB user.
- HTTPS only, login throttling, session expiry, audit log.

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Burmese glyph shaping wrong in PDF | Medium | High | Spike in week 1; Padauk fallback; visual checklist with real text |
| Mixed Zawgyi/Unicode data from old files | High | Medium | Detect and warn; conversion note in import script; manual review |
| FX source unreliable (Myanmar rates) | Medium | Medium | Manual override, history table, alarm, no auto-repricing |
| Scope creep into approvals/email | High | Medium | Explicit non-goals; backlog below; MVP ships without them |
| Single EC2 is a SPOF | Medium | Medium | Snapshot + redeploy runbook; ASG upgrade path in Phase 2 |
| Total/rounding disputes with finance | Low | High | Single formula documented, DB-authoritative totals, worked example test |
| Data import quality | High | Medium | Import in staging, spot-check 20 records, keep source files |
| Staff bypass the system | Medium | High | Make PDF faster than Word, train, management mandate, track quote numbers |

## 6. Post-MVP backlog (ordered by expected value)

1. **Email delivery + view tracking** — send PDF from the app, log opens, resend.
2. **Approval workflow** — rules by discount/margin/value, approver inbox, comments.
3. **Excel import/export** — bulk price updates, BOQ import for project quotes.
4. **Customer portal** — read-only link per quote, accept button, expiry handling.
5. **Templates by business line** — CCTV, networking, software, maintenance wording.
6. **Bundles/kits** — group items with a single price (e.g. "camera kit").
7. **Multi-company / letterhead variants** — if a second legal entity is added.
8. **SSO** — Microsoft 365 or Google Workspace via OIDC.
9. **HA** — ALB + ASG, RDS Multi-AZ already in prod, then read replica for reports.
10. **Mobile-friendly editor** — site surveys on tablets.

## 7. Team and responsibilities

| Role | Responsibility |
|---|---|
| Developer | Architecture, implementation, infra, tests, deploy |
| Business owner | Priorities, discount policy, sign-off |
| Sales lead | UAT, real quote samples, training content |
| Finance | Tax treatment, reconciliation, export format |
| Part-time reviewer | Code review, security checklist, design feedback |

## 8. Definition of done (per feature)

- Typed end-to-end, no `any` at boundaries.
- Zod-validated server action with role guard.
- Unit test for domain logic; integration test for the DB path.
- Empty, loading, and error states.
- Audit event where state changes.
- Documented in `docs/` if behaviour is non-obvious.
- Deployed to staging and exercised by someone other than the author.
