# VitalTech Myanmar — Quotation Generation System (QGS)

Internal system for creating, pricing, branding, and tracking quotations for
VitalTech Myanmar's system-integration business.

**Status:** Phase 0–3 scaffold implemented. The database, auth, quotation
editor, lifecycle actions, reports, branded PDF, dev/production containers, and
nginx edge config are in the repository and have been exercised end to end
against PostgreSQL 16. Remaining MVP work is UAT hardening, catalog/customer
editing forms, S3 caching, and the production AWS rollout
(see [docs/07-delivery-plan.md](docs/07-delivery-plan.md)).

---

## Stack

| Layer | Choice |
|---|---|
| UI + server | Next.js 15 (App Router, React 19, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| Data access | Drizzle ORM + `pg` (node-postgres) |
| Database | PostgreSQL 16 on Amazon RDS (private subnets) |
| Auth | Auth.js v5, Credentials provider, Argon2id, JWT sessions |
| Files | PDFs generated on demand (S3 cache deferred) |
| PDF | Chromium (Playwright) → HTML/CSS print template |
| Hosting | Docker on EC2 (t4g.small), nginx 1.27 for TLS and rate limiting |
| Edge | nginx (HTTP/2, gzip, login throttle) + host certbot / Let's Encrypt |
| CI/CD | GitHub Actions → ECR → SSM Run Command |
| Observability | CloudWatch (logs/alarms), Sentry (optional) |

## Why these choices (short version)

- **One Next.js deployment instead of a separate API** — the team is small; server
  actions remove a whole network boundary and auth duplication.
- **EC2 + RDS, not Lambda** — PDF generation needs a real Chromium instance, and
  Myanmar script shaping is unreliable in lightweight PDF libraries. A long-lived
  Node process also keeps cold starts and DB connection churn out of the picture.
- **Chromium for PDF** — `@react-pdf/renderer` and similar libraries do not do full
  Unicode shaping; Burmese text (and mixed Burmese/English) can render with broken
  glyph clusters. Real Chrome gets it right on the first try.
- **Postgres as source of truth for money** — `numeric(18,2)`, never floats, with
  totals recalculated inside the database so the API and the PDF can never disagree.
- **Snapshot everything that appears on a PDF** — customer details, product names,
  prices, tax rates, and FX rate are copied onto the quotation at save time.
  Editing a product tomorrow must not silently change last month's issued quote.

## Repository layout

```
.
├── src/
│   ├── app/
│   │   ├── login/                    credentials sign-in
│   │   ├── (app)/                    authenticated layout + side nav
│   │   │   ├── quotations/           list, new, [id], [id]/edit, actions, editor
│   │   │   ├── customers/            read-only list (Phase 1 forms pending)
│   │   │   ├── products/             read-only catalog (Phase 1 forms pending)
│   │   │   ├── reports/              monthly, pipeline, product performance
│   │   │   └── settings/             company profile edit + FX read-only (admin)
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/   Auth.js handlers
│   │   │   ├── health/               DB-backed health check
│   │   │   ├── quotations/[id]/pdf/  Chromium PDF (inline or download)
│   │   │   ├── cron/fx/              EventBridge FX sync
│   │   │   └── cron/expire/          EventBridge validity expiry
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── lib/
│   │   ├── auth.ts                   Auth.js config (Credentials + JWT)
│   │   ├── auth/password.ts          Argon2id helpers
│   │   ├── db/                       Drizzle client, schema, queries
│   │   ├── domain/                   pricing, money, guardrails, Zod, formatting
│   │   ├── pdf/                      Chromium renderer, HTML template, fonts
│   │   ├── editor-types.ts           serialisable editor DTOs
│   │   └── session.ts                requireSession/requireRole guards
│   └── middleware.ts                 per-request nonce CSP (no authz)
├── db/migrations/                     forward-only SQL migrations
├── scripts/                           migrate.mjs, seed.mjs
├── deploy/                            Dockerfile, nginx config, dev compose
├── docker-compose.prod.yml            EC2 production stack
├── docs/                              design package
└── .github/workflows/                 build + deploy
```

## Documents

| Doc | Contents |
|---|---|
| [01-system-architecture.md](docs/01-system-architecture.md) | Context, AWS topology, layers, decisions, NFRs |
| [02-data-model.md](docs/02-data-model.md) | ERD, tables, snapshots, lifecycle, numbering |
| [03-pricing-and-currency.md](docs/03-pricing-and-currency.md) | Money rules, formulas, VAT, FX, worked example |
| [04-flows-and-api.md](docs/04-flows-and-api.md) | Screens, server actions, authz, sequences, errors |
| [05-pdf-generation.md](docs/05-pdf-generation.md) | Chromium pipeline, Myanmar fonts, templates, caching |
| [06-security-and-aws-ops.md](docs/06-security-and-aws-ops.md) | Network/IAM/secrets, deploy, backups, alarms, cost |
| [07-delivery-plan.md](docs/07-delivery-plan.md) | Phases, acceptance criteria, risks, backlog |
| [db/migrations/0001_init.sql](db/migrations/0001_init.sql) | Runnable schema, totals engine, reporting views |

## Environments

| Env | App | Database | Purpose |
|---|---|---|---|
| Local | `next dev` in Docker | Postgres 16 container | Development |
| Staging | EC2 + Docker | RDS `db.t4g.micro` (single-AZ) | UAT, PDF sign-off |
| Production | EC2 + Docker | RDS `db.t4g.small` (Multi-AZ) | Live |

## Local development

Everything runs in Docker. Node 22 and pnpm 9.15.4 are only needed if you want to
run the app outside a container.

### One command (recommended)

```bash
cp .env.example .env.local                  # optional; compose sets dev defaults
docker compose -f deploy/docker-compose.dev.yml up
```

The `app` service installs dependencies, applies migrations, seeds demo data,
and starts `next dev` on <http://localhost:3000>. The database is exposed on
`localhost:55432` for `psql`/GUI tools.

### Host workflow

```bash
docker compose -f deploy/docker-compose.dev.yml up -d db
pnpm install
pnpm db:migrate
SEED_ADMIN_PASSWORD='choose-a-strong-password' pnpm db:seed
pnpm dev
```

Useful scripts:

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js (start uses standalone output) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest pricing/guardrail fixtures |
| `pnpm lint` | ESLint via `next lint` |
| `pnpm db:migrate` | Apply pending SQL migrations |
| `pnpm db:seed` | Company profile, catalog, FX rates, demo quote, first admin |

### Seed sign-in

`pnpm db:seed` creates `admin@vitaltechmyanmar.com`. If `SEED_ADMIN_PASSWORD` is not
set it prints a random one once; the checked-in demo uses:

```
email:    admin@vitaltechmyanmar.com
password: DevPassword123!     # only when SEED_ADMIN_PASSWORD is set to this
```

Never reuse that password outside a local database. Add sales/viewer accounts in
SQL or the (pending) admin UI; there is deliberately no public sign-up.

## What works today

- Credentials login with Argon2id, JWT sessions (8 h), role guards in every page
  and server action, admin/sales/viewer views.
- Quotation list with search/status filters, create/edit drafts with live totals,
  optimistic-concurrency guard, discount/margin guardrails, status transitions,
  revisions, draft deletion, activity log.
- Catalog and customer snapshots frozen on the quote; MMK pro-rata discount
  allocation; DB triggers are the source of truth for totals.
- Branded A4 PDF with Noto Sans Myanmar + Padauk + Inter, embedded as base64
  fonts, DRAFT watermark, page numbers, terms, bank details, signature blocks.
- Admin company profile editing (letterhead, contact, bank details, quotation
  defaults) with server-side validation; new quotes pick up the defaults.
- Reports (monthly, pipeline, product performance), catalog/customer read-only
  pages, health endpoint, FX and expiry cron endpoints.
- FX sync pulls USD/THB from the free open.er-api.com feed (or `FX_PROVIDER_URL`)
  and stores MMK-per-unit history; admins can trigger **Refresh rates** in Settings.
- Nonce-based CSP, HSTS/security headers at nginx, login throttle, Docker
  standalone image, migrator image, nginx + certbot compose stack.

## Deliberately not in the MVP

- Approval workflow, email delivery, customer portal.
- Editing forms for products/customers (read-only for now); company logo upload.
- Manual exchange-rate entry/editing in Settings (the open feed and **Refresh
  rates** cover daily use; add a manual row in SQL if the feed is unavailable).
- S3 PDF cache — PDFs render on demand and are never stored server-side.
- Password reset / MFA / SSO.

## Database migrations

Hand-written, forward-only SQL in `db/migrations/`, applied by
`scripts/migrate.mjs`. The runner takes a Postgres advisory lock, records a
SHA-256 checksum per file in `schema_migrations`, and refuses to run if an
already-applied file changed. Add a new numbered file instead of editing
history. Production runs the same script in a one-off migrator container
(`<app-image>-migrate`).

## PDF and Myanmar text

`GET /api/quotations/:id/pdf` launches Chromium through `playwright-core`
(pinned to `1.49.1` to match the runtime image), waits for
`document.fonts.ready`, and prints to A4. Fonts are read from `public/fonts`,
base64-inlined per request, and cached in memory. PDFs are generated on demand
and returned `no-store`; there is no S3 cache yet. Burmese must be Unicode
(Noto Sans Myanmar), never Zawgyi.

## Security notes

- Authorization lives in server components/actions (`requireSession`,
  `requireRole`), not middleware, so it never depends on the edge runtime.
- `src/middleware.ts` only adds a per-request nonce CSP and
  `frame-ancestors 'none'`. `upgrade-insecure-requests` is enabled only when
  `APP_URL`/`AUTH_URL` is HTTPS, so plain-HTTP local/EC2 tests still work.
- nginx terminates TLS, redirects HTTP → HTTPS, throttles `/login`, and adds
  HSTS and the usual security headers. The app binds to `127.0.0.1:3000`.
- Never commit real secrets. Production values come from AWS Secrets Manager
  into `.env.production` at container start.

## Conventions

- All money math on the server, in `numeric`/`decimal.js`. No `parseFloat` on prices.
- Every mutating server action validates with Zod and calls `requireRole()`.
- Dates are `date`/`timestamptz` in Postgres; the app renders in `Asia/Yangon`.
- PDF output is a derivative artifact: it can always be regenerated from the quote.

## Validation status

`db/migrations/0001_init.sql` was applied to a clean PostgreSQL 16 instance, and the
worked example in [doc 03](docs/03-pricing-and-currency.md#6-worked-example) was
reproduced exactly by the database triggers:

```
subtotal 1,409.50 · discount 28.19 · tax 69.07 · total 1,450.38 USD
MMK 6,526,710.00 · cost 1,180,000.00 · margin 5,035,895.00
```

The scaffold has also been exercised end to end:

- `tsc --noEmit`, 12 Vitest pricing tests, and `next build` pass without a
  database connection.
- Migration + seed are idempotent; the demo quote reproduces
  `2,276.00 / 45.52 / 111.52 / 2,342.00 USD` and `10,539,000.00 MMK`.
- Browser flow: login, CSP nonce present with no console errors, list/detail,
  create, edit/save, stale-tab conflict rejection, sales discount guardrail,
  admin override, send status, revision clone, viewer read-only views, missing
  FX rejection.
- PDF: 2-page A4 with Inter and Noto Sans Myanmar embedded; `pdftotext` extracts
  Burmese item descriptions intact. `/api/health` reports DB reachability.
- Production standalone (`node server.js`) and the multi-stage Docker image run
  with the Playwright Chromium runtime; `nginx -t`, HTTP→HTTPS redirect, login
  throttling, and headers were validated earlier.
- Cron endpoints: unauthenticated → 401, expiry marks overdue sent quotes and
  writes an event; FX pulls open.er-api.com and upserts today's USD/THB rows.

CI repeats typecheck, tests, and build on every commit; deploy runs the migrator
image before recreating the app and rolls back if `/api/health` fails.
