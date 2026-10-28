-- ============================================================================
-- VitalTech Myanmar — Quotation Generation System
-- 0001_init.sql
--
-- Target : PostgreSQL 16 (Amazon RDS)
-- Scope  : core schema, numbering, authoritative totals engine, reporting views
--
-- Conventions
--   * money      numeric(18,2), unit price numeric(18,4), FX numeric(20,8)
--   * tax rates  numeric(6,5)  (0.05 = 5%)
--   * timestamps timestamptz, rendered in Asia/Yangon by the application
--   * totals     written only by recalc_quotation_totals() via triggers
-- ============================================================================

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enumerations
-- ----------------------------------------------------------------------------
create type user_role as enum ('admin', 'sales', 'viewer');

create type quotation_status as enum (
  'draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'
);

create type discount_kind as enum ('none', 'percent', 'amount');

-- ----------------------------------------------------------------------------
-- updated_at helper
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Staff accounts (no public sign-up; admins create users)
-- ----------------------------------------------------------------------------
create table users (
  id                   uuid primary key default gen_random_uuid(),
  email                citext not null unique,
  password_hash        text   not null,
  full_name            text   not null default '',
  role                 user_role not null default 'sales',
  is_active            boolean not null default true,
  must_change_password boolean not null default true,
  last_login_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Company profile (single row) — drives the PDF letterhead and defaults
-- ----------------------------------------------------------------------------
create table company_settings (
  id                       smallint primary key default 1 check (id = 1),
  legal_name               text not null default 'VitalTech Myanmar Co., Ltd.',
  brand_name               text not null default 'VitalTech Myanmar',
  tagline                  text,
  registration_no          text,
  tax_id                   text,
  address                  text,
  phone                    text,
  email                    text,
  website                  text,
  logo_key                 text,             -- S3 object key
  bank_details             text,
  quote_prefix             text not null default 'VT-Q',
  default_currency         text not null default 'MMK'
                             check (default_currency in ('MMK', 'USD', 'THB')),
  default_tax_rate         numeric(6,5) not null default 0.05
                             check (default_tax_rate between 0 and 1),
  tax_label                text not null default 'Commercial Tax',
  default_validity_days    integer not null default 30 check (default_validity_days > 0),
  default_payment_terms    text,
  default_delivery_terms   text,
  default_warranty_terms   text,
  footer_note              text,
  updated_at               timestamptz not null default now()
);

create trigger company_settings_set_updated_at
before update on company_settings
for each row execute function set_updated_at();

insert into company_settings (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Customers
-- ----------------------------------------------------------------------------
create table customers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  attention        text,
  tax_id           text,
  address          text,
  city             text,
  country          text not null default 'Myanmar',
  phone            text,
  email            citext,
  default_currency text not null default 'MMK'
                     check (default_currency in ('MMK', 'USD', 'THB')),
  notes            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index customers_name_idx on customers (lower(name));
create index customers_active_idx on customers (id) where is_active;

create trigger customers_set_updated_at
before update on customers
for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Product / service catalog
--   cost is always MMK so margin is comparable across currencies
-- ----------------------------------------------------------------------------
create table products (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null unique,
  name            text not null,
  description     text,
  category        text,
  unit            text not null default 'pcs',
  cost_price_mmk  numeric(18,2) not null default 0 check (cost_price_mmk >= 0),
  tax_rate        numeric(6,5) not null default 0.05 check (tax_rate between 0 and 1),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index products_name_idx on products (lower(name));
create index products_category_idx on products (category);
create index products_active_idx on products (id) where is_active;

create trigger products_set_updated_at
before update on products
for each row execute function set_updated_at();

-- One sell price per currency. The app requires at least an MMK row.
create table product_prices (
  product_id uuid not null references products(id) on delete cascade,
  currency   text not null check (currency in ('MMK', 'USD', 'THB')),
  unit_price numeric(18,4) not null check (unit_price >= 0),
  primary key (product_id, currency)
);

-- ----------------------------------------------------------------------------
-- FX history: 1 unit of `currency` = mmk_per_unit MMK
-- Immutable history; corrections are new rows (or same-day upsert for manual).
-- ----------------------------------------------------------------------------
create table exchange_rates (
  id             bigint generated always as identity primary key,
  currency       text not null check (currency in ('USD', 'THB')),
  mmk_per_unit   numeric(20,8) not null check (mmk_per_unit > 0),
  effective_date date not null,
  source         text not null default 'manual'
                   check (source in ('manual', 'cbm', 'provider')),
  note           text,
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (currency, effective_date)
);

create index exchange_rates_lookup_idx
  on exchange_rates (currency, effective_date desc);

-- ----------------------------------------------------------------------------
-- Document numbering
-- ----------------------------------------------------------------------------
create table doc_counters (
  doc_type   text not null,
  period     text not null,          -- '2026' (Asia/Yangon year)
  last_value integer not null default 0,
  primary key (doc_type, period)
);

-- Atomic, gap-tolerant numbering: VT-Q-2026-0001
create or replace function next_doc_no(
  p_doc_type text,
  p_prefix   text,
  p_period   text default to_char(now() at time zone 'Asia/Yangon', 'YYYY')
) returns text
language plpgsql as $$
declare
  v_value integer;
begin
  insert into doc_counters (doc_type, period, last_value)
  values (p_doc_type, p_period, 1)
  on conflict (doc_type, period)
    do update set last_value = doc_counters.last_value + 1
  returning last_value into v_value;

  return p_prefix || '-' || p_period || '-' || lpad(v_value::text, 4, '0');
end;
$$;

-- ----------------------------------------------------------------------------
-- Quotations
-- ----------------------------------------------------------------------------
create table quotations (
  id            uuid primary key default gen_random_uuid(),
  quote_no      text not null,
  revision      integer not null default 1 check (revision >= 1),
  parent_id     uuid references quotations(id) on delete set null,

  customer_id       uuid not null references customers(id) on delete restrict,
  customer_snapshot jsonb not null default '{}'::jsonb,

  project_title text,
  subject       text,

  status   quotation_status not null default 'draft',
  currency text not null default 'MMK'
             check (currency in ('MMK', 'USD', 'THB')),

  -- FX frozen at save time; MMK quotes are always 1
  fx_rate_mmk_per_unit numeric(20,8) not null default 1
                         check (fx_rate_mmk_per_unit > 0),
  fx_rate_date         date,

  default_tax_rate numeric(6,5) not null default 0.05
                     check (default_tax_rate between 0 and 1),

  discount_kind  discount_kind not null default 'none',
  discount_value numeric(18,4) not null default 0 check (discount_value >= 0),

  -- Quote-currency totals, written by recalc_quotation_totals()
  subtotal       numeric(18,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(18,2) not null default 0 check (discount_total >= 0),
  vat_total      numeric(18,2) not null default 0 check (vat_total >= 0),
  grand_total    numeric(18,2) not null default 0 check (grand_total >= 0),

  -- Reporting currency (MMK)
  subtotal_mmk    numeric(18,2) not null default 0,
  grand_total_mmk numeric(18,2) not null default 0,
  cost_total_mmk  numeric(18,2) not null default 0,
  margin_mmk      numeric(18,2) generated always as (
    round((subtotal - discount_total) * fx_rate_mmk_per_unit, 2) - cost_total_mmk
  ) stored,

  valid_until    date,
  payment_terms  text,
  delivery_terms text,
  warranty_terms text,
  exclusions     text,
  notes          text,

  prepared_by uuid references users(id) on delete set null,
  sent_at     timestamptz,
  accepted_at timestamptz,

  pdf_key          text,
  pdf_generated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (quote_no, revision),
  constraint quotations_fx_chk
    check (currency <> 'MMK' or fx_rate_mmk_per_unit = 1)
);

create index quotations_status_idx  on quotations (status, created_at desc);
create index quotations_customer_idx on quotations (customer_id, created_at desc);
create index quotations_created_idx on quotations (created_at desc, id desc);
create index quotations_validity_idx on quotations (valid_until)
  where status = 'sent';

create trigger quotations_set_updated_at
before update on quotations
for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Quotation lines (snapshots; line_total is generated so it cannot drift)
-- ----------------------------------------------------------------------------
create table quotation_items (
  id           uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  position     integer not null default 0 check (position >= 0),

  product_id uuid references products(id) on delete set null,

  sku         text,
  name        text not null,
  description text,
  unit        text not null default 'pcs',

  quantity     numeric(14,3) not null check (quantity > 0),
  unit_price   numeric(18,4) not null check (unit_price >= 0),
  discount_pct numeric(6,3)  not null default 0
                 check (discount_pct between 0 and 100),
  tax_rate     numeric(6,5)  not null default 0.05
                 check (tax_rate between 0 and 1),

  cost_unit_mmk numeric(18,2) not null default 0 check (cost_unit_mmk >= 0),

  line_total numeric(18,2) generated always as (
    round(quantity * unit_price * (1 - discount_pct / 100.0), 2)
  ) stored,

  cost_total_mmk numeric(18,2) generated always as (
    round(quantity * cost_unit_mmk, 2)
  ) stored,

  created_at timestamptz not null default now()
);

create index quotation_items_quote_idx on quotation_items (quotation_id, position);
create index quotation_items_product_idx on quotation_items (product_id);

-- ----------------------------------------------------------------------------
-- Audit trail / activity timeline
-- ----------------------------------------------------------------------------
create table quotation_events (
  id           bigint generated always as identity primary key,
  quotation_id uuid not null references quotations(id) on delete cascade,
  event_type   text not null,    -- created|updated|sent|accepted|rejected|
                                 -- revised|expired|pdf_generated|note_added
  actor_id     uuid references users(id) on delete set null,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index quotation_events_quote_idx
  on quotation_events (quotation_id, created_at desc);

-- ============================================================================
-- Totals engine
--
-- subtotal        = sum(line_total)
-- discount_total  = header percent/amount, capped at subtotal
-- vat_total       = sum(round((line_total - pro-rata discount) * tax_rate, 2))
-- grand_total     = subtotal - discount_total + vat_total
-- *_mmk           = quote-currency values * frozen FX rate
--
-- Returns quietly when the quotation no longer exists (cascade deletes).
-- ============================================================================
create or replace function recalc_quotation_totals(p_quotation_id uuid)
returns void
language plpgsql as $$
declare
  q             quotations%rowtype;
  v_subtotal    numeric(18,2);
  v_cost_total  numeric(18,2);
  v_discount    numeric(18,2);
  v_vat         numeric(18,2);
begin
  select * into q from quotations where id = p_quotation_id;
  if not found then
    return;
  end if;

  select coalesce(sum(line_total), 0), coalesce(sum(cost_total_mmk), 0)
    into v_subtotal, v_cost_total
  from quotation_items
  where quotation_id = p_quotation_id;

  v_discount := case q.discount_kind
    when 'percent' then round(v_subtotal * least(greatest(q.discount_value, 0), 100) / 100.0, 2)
    when 'amount'  then least(round(q.discount_value, 2), v_subtotal)
    else 0::numeric
  end;

  select coalesce(sum(
           round(
             (line_total - case
                when v_subtotal > 0 then v_discount * line_total / v_subtotal
                else 0
              end) * tax_rate,
             2
           )
         ), 0)
    into v_vat
  from quotation_items
  where quotation_id = p_quotation_id;

  update quotations set
    subtotal        = v_subtotal,
    discount_total  = v_discount,
    vat_total       = v_vat,
    grand_total     = v_subtotal - v_discount + v_vat,
    subtotal_mmk    = round(v_subtotal * q.fx_rate_mmk_per_unit, 2),
    grand_total_mmk = round((v_subtotal - v_discount + v_vat) * q.fx_rate_mmk_per_unit, 2),
    cost_total_mmk  = v_cost_total
  where id = p_quotation_id;
end;
$$;

create or replace function trg_quotation_items_recalc() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform recalc_quotation_totals(old.quotation_id);
    return old;
  end if;

  -- line moved between quotations
  if tg_op = 'UPDATE' and old.quotation_id <> new.quotation_id then
    perform recalc_quotation_totals(old.quotation_id);
  end if;

  perform recalc_quotation_totals(new.quotation_id);
  return new;
end;
$$;

create trigger quotation_items_totals
after insert or update or delete on quotation_items
for each row execute function trg_quotation_items_recalc();

create or replace function trg_quotations_recalc() returns trigger
language plpgsql as $$
begin
  perform recalc_quotation_totals(new.id);
  return new;
end;
$$;

create trigger quotations_totals
after update of currency, fx_rate_mmk_per_unit, discount_kind,
                discount_value, default_tax_rate
on quotations
for each row execute function trg_quotations_recalc();

-- ============================================================================
-- Reporting views
-- (App-layer RBAC; cost/margin columns are stripped for `viewer` in code.)
-- ============================================================================

create view v_quotation_summary as
select
  q.id,
  q.quote_no,
  q.revision,
  q.status,
  q.currency,
  q.fx_rate_mmk_per_unit,
  q.subtotal,
  q.discount_total,
  q.vat_total,
  q.grand_total,
  q.subtotal_mmk,
  q.grand_total_mmk,
  q.cost_total_mmk,
  q.margin_mmk,
  q.valid_until,
  q.sent_at,
  q.accepted_at,
  q.created_at,
  c.name         as customer_name,
  u.full_name    as prepared_by_name
from quotations q
join customers c on c.id = q.customer_id
left join users u on u.id = q.prepared_by;

create view v_monthly_sales as
select
  date_trunc('month', q.created_at at time zone 'Asia/Yangon')::date as month,
  count(*)                                                          as quotes_created,
  count(*) filter (
    where q.status in ('sent', 'accepted', 'rejected', 'expired')
  )                                                                  as quotes_issued,
  count(*) filter (where q.status = 'accepted')                      as quotes_won,
  coalesce(sum(q.grand_total_mmk), 0)                                as quoted_mmk,
  coalesce(sum(q.grand_total_mmk) filter (where q.status = 'accepted'), 0) as won_mmk
from quotations q
where q.status <> 'cancelled'
group by 1
order by 1;

create view v_pipeline as
select
  status,
  count(*)                              as quote_count,
  coalesce(sum(grand_total_mmk), 0)     as value_mmk,
  coalesce(round(avg(grand_total_mmk), 2), 0) as avg_value_mmk
from quotations
group by status;

create view v_product_performance as
select
  coalesce(i.product_id::text, 'adhoc:' || i.name) as product_key,
  max(i.sku)                                      as sku,
  max(i.name)                                     as name,
  count(distinct q.id)                            as quote_count,
  sum(i.quantity)                                 as quantity_sold,
  sum(i.line_total * q.fx_rate_mmk_per_unit)      as revenue_mmk,
  sum(i.cost_total_mmk)                           as cost_mmk,
  sum(i.line_total * q.fx_rate_mmk_per_unit)
    - sum(i.cost_total_mmk)                       as margin_mmk
from quotation_items i
join quotations q on q.id = i.quotation_id
where q.status in ('sent', 'accepted')
group by 1;

-- ============================================================================
-- Least-privilege database roles (run once per environment, with admin creds)
--
--   create role qgs_app login password '<from Secrets Manager>';
--   create role qgs_migrator login password '<from Secrets Manager>';
--   grant connect on database vitaltech_quotes to qgs_app, qgs_migrator;
--   grant usage on schema public to qgs_app, qgs_migrator;
--   grant select, insert, update, delete on all tables in schema public to qgs_app;
--   grant usage, select on all sequences in schema public to qgs_app;
--   alter default privileges in schema public
--     grant select, insert, update, delete on tables to qgs_app;
--   grant all on schema public to qgs_migrator;   -- DDL, migrations only
-- ============================================================================
