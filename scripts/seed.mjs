#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import pg from "pg";

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

function yangonToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const client = new Client({
  connectionString,
  ssl: /sslmode=require/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
});

async function ensureAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@vitaltechmyanmar.com").toLowerCase();
  const existing = await client.query("select id, email from users where email = $1", [email]);
  if (existing.rowCount > 0) {
    console.log(`[seed] admin ${email} already exists (password unchanged)`);
    return existing.rows[0].id;
  }

  const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString("base64url");
  const passwordHash = await hash(password, ARGON2_OPTIONS);

  const inserted = await client.query(
    `insert into users (email, password_hash, full_name, role, must_change_password)
     values ($1, $2, $3, 'admin', $4)
     returning id`,
    [
      email,
      passwordHash,
      process.env.SEED_ADMIN_NAME ?? "System Administrator",
      process.env.SEED_FORCE_PASSWORD_CHANGE === "1",
    ],
  );

  console.log("[seed] created admin account");
  console.log(`[seed]   email:    ${email}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`[seed]   password: ${password}`);
    console.log("[seed]   shown once — sign in and store it in a password manager");
  }
  return inserted.rows[0].id;
}

async function ensureCompany() {
  await client.query(
    `insert into company_settings (
       id, legal_name, brand_name, tagline, registration_no, tax_id, address,
       phone, email, website, bank_details, quote_prefix, default_currency,
       default_tax_rate, tax_label, default_validity_days,
       default_payment_terms, default_delivery_terms, default_warranty_terms,
       footer_note
     ) values (
       1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VT-Q', 'MMK', 0.05,
       'Commercial Tax', 30, $11, $12, $13, $14
     )
     -- The migration creates the singleton row, so a plain DO NOTHING would
     -- leave every seeded profile field empty. Fill only nullable fields that
     -- are still unset, so re-running the seed never overwrites an edit made
     -- in Settings.
     on conflict (id) do update set
       tagline                = coalesce(company_settings.tagline, excluded.tagline),
       registration_no        = coalesce(company_settings.registration_no, excluded.registration_no),
       tax_id                 = coalesce(company_settings.tax_id, excluded.tax_id),
       address                = coalesce(company_settings.address, excluded.address),
       phone                  = coalesce(company_settings.phone, excluded.phone),
       email                  = coalesce(company_settings.email, excluded.email),
       website                = coalesce(company_settings.website, excluded.website),
       bank_details           = coalesce(company_settings.bank_details, excluded.bank_details),
       default_payment_terms  = coalesce(company_settings.default_payment_terms, excluded.default_payment_terms),
       default_delivery_terms = coalesce(company_settings.default_delivery_terms, excluded.default_delivery_terms),
       default_warranty_terms = coalesce(company_settings.default_warranty_terms, excluded.default_warranty_terms),
       footer_note            = coalesce(company_settings.footer_note, excluded.footer_note)`,
    [
      "VitalTech Myanmar Co., Ltd.",
      "VitalTech Myanmar",
      "System integration · IT infrastructure · Managed services",
      "100123456",
      "MYA-123456789",
      "No. 123, Pyay Road, Kamayut Township, Yangon, Myanmar\n" +
        "အမှတ် ၁၂၃၊ ပြည်လမ်း၊ ကမာရွတ်မြို့နယ်၊ ရန်ကုန်မြို့",
      "+95 9 123 456 789",
      "sales@vitaltechmyanmar.com",
      "https://vitaltechmyanmar.com",
      "Bank: KBZ Bank\nAccount name: VitalTech Myanmar Co., Ltd.\nAccount no.: 0123-4567-8901-2345\nSWIFT: KBZMMMYN",
      "50% advance with purchase order; balance net 30 days after acceptance.",
      "Delivery within 4–6 weeks after order confirmation, ex-works Yangon.",
      "12 months manufacturer warranty on hardware; 30 days on configuration services.",
      "VitalTech Myanmar · System integration and managed IT services",
    ],
  );
  console.log("[seed] company profile ready");
}

async function ensureCustomer(name, values) {
  const existing = await client.query("select id from customers where name = $1 limit 1", [name]);
  if (existing.rowCount > 0) return existing.rows[0].id;

  const inserted = await client.query(
    `insert into customers
       (name, attention, tax_id, address, city, country, phone, email, default_currency, notes)
     values ($1, $2, $3, $4, $5, 'Myanmar', $6, $7, $8, $9)
     returning id`,
    [name, ...values],
  );
  return inserted.rows[0].id;
}

async function ensureProduct(product) {
  const row = await client.query(
    `insert into products (sku, name, description, category, unit, cost_price_mmk, tax_rate)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (sku) do update set updated_at = now()
     returning id`,
    [
      product.sku,
      product.name,
      product.description,
      product.category,
      product.unit,
      product.costPriceMmk,
      product.taxRate,
    ],
  );
  const id = row.rows[0].id;

  for (const [currency, price] of Object.entries(product.prices)) {
    await client.query(
      `insert into product_prices (product_id, currency, unit_price)
       values ($1, $2, $3)
       on conflict (product_id, currency) do update set unit_price = excluded.unit_price`,
      [id, currency, price],
    );
  }
  return id;
}

async function ensureRates() {
  const today = yangonToday();
  for (const [currency, rate] of [
    ["USD", 4500],
    ["THB", 125],
  ]) {
    await client.query(
      `insert into exchange_rates (currency, mmk_per_unit, effective_date, source, note)
       values ($1, $2, $3, 'provider', 'seed demo rate')
       on conflict (currency, effective_date) do nothing`,
      [currency, rate, today],
    );
  }
  console.log("[seed] exchange rates ready");
}

async function ensureDemoQuote(adminId, customerId) {
  const existing = await client.query("select id from quotations limit 1");
  if (existing.rowCount > 0) {
    console.log("[seed] quotation already present (demo quote skipped)");
    return;
  }

  const today = yangonToday();
  const validUntil = addDays(today, 30);
  const rateRow = await client.query(
    `select mmk_per_unit from exchange_rates
     where currency = 'USD' and effective_date <= $1
     order by effective_date desc, id desc limit 1`,
    [today],
  );
  const fx = rateRow.rows[0]?.mmk_per_unit ?? "4500";

  const customer = await client.query(
    "select name, attention, tax_id, address, city, country, phone, email from customers where id = $1",
    [customerId],
  );
  const snapshot = {
    name: customer.rows[0].name,
    attention: customer.rows[0].attention,
    taxId: customer.rows[0].tax_id,
    address: customer.rows[0].address,
    city: customer.rows[0].city,
    country: customer.rows[0].country,
    phone: customer.rows[0].phone,
    email: customer.rows[0].email,
  };

  const numberResult = await client.query("select next_doc_no('quotation', 'VT-Q') as quote_no");
  const quoteNo = numberResult.rows[0].quote_no;

  const inserted = await client.query(
    `insert into quotations (
       quote_no, revision, customer_id, customer_snapshot, project_title, subject,
       status, currency, fx_rate_mmk_per_unit, fx_rate_date, default_tax_rate,
       discount_kind, discount_value, valid_until, payment_terms, delivery_terms,
       warranty_terms, exclusions, notes, prepared_by
     ) values (
       $1, 1, $2, $3::jsonb, $4, $5, 'draft', 'USD', $6, $7, 0.05,
       'percent', 2, $8, $9, $10, $11, $12, $13, $14
     ) returning id`,
    [
      quoteNo,
      customerId,
      JSON.stringify(snapshot),
      "Head office network refresh",
      "Quotation for network equipment, installation and commissioning",
      fx,
      today,
      validUntil,
      "50% advance with purchase order; balance net 30 days after acceptance.",
      "Delivery within 4–6 weeks after order confirmation.",
      "12 months manufacturer warranty on hardware.",
      "Civil works, cabling containment and ISP circuits are excluded.",
      "Demo quotation generated by scripts/seed.mjs — safe to edit or delete.",
      adminId,
    ],
  );
  const quoteId = inserted.rows[0].id;

  const lines = [
    {
      sku: "VT-SW-9200",
      name: "Cisco Catalyst 9200 24-Port Switch",
      description: "စီစကို ကွန်ရက် ဆွစ်ချ် — ၂၄ ပေါက်၊ PoE+",
      unit: "pcs",
      quantity: 2,
      unitPrice: 745,
      cost: 2_100_000,
    },
    {
      sku: "VT-AP-6E",
      name: "UniFi U6 Enterprise Access Point",
      description: "Wi-Fi 6E အဝိုင်းလိုက် ဝိုင်ဖိုင် ချိတ်ဆက်ကိရိယာ",
      unit: "pcs",
      quantity: 4,
      unitPrice: 75,
      cost: 210_000,
    },
    {
      sku: "VT-CAB-CAT6",
      name: "Cat6 UTP cable — 305 m box",
      description: "ကက်တ် ၆ ကေဘယ် — ၃၀၅ မီတာ",
      unit: "box",
      quantity: 4,
      unitPrice: 34,
      cost: 95_000,
    },
    {
      sku: "VT-SVC-INST",
      name: "Installation, configuration and testing",
      description: "တပ်ဆင်ခြင်း၊ ပြင်ဆင်ခြင်း နှင့် စမ်းသပ်ခြင်း",
      unit: "lot",
      quantity: 1,
      unitPrice: 350,
      cost: 300_000,
    },
  ];

  for (const [index, line] of lines.entries()) {
    const product = await client.query("select id from products where sku = $1", [line.sku]);
    await client.query(
      `insert into quotation_items (
         quotation_id, position, product_id, sku, name, description, unit,
         quantity, unit_price, discount_pct, tax_rate, cost_unit_mmk
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0.05, $10)`,
      [
        quoteId,
        index,
        product.rows[0]?.id ?? null,
        line.sku,
        line.name,
        line.description,
        line.unit,
        line.quantity,
        line.unitPrice,
        line.cost,
      ],
    );
  }

  await client.query(
    `insert into quotation_events (quotation_id, event_type, actor_id, details)
     values ($1, 'created', $2, '{"source":"seed"}'::jsonb)`,
    [quoteId, adminId],
  );

  const totals = await client.query(
    "select quote_no, subtotal, discount_total, vat_total, grand_total, grand_total_mmk from quotations where id = $1",
    [quoteId],
  );
  console.log("[seed] demo quotation ready:", totals.rows[0]);
}

async function main() {
  await client.connect();
  await client.query("begin");
  try {
    const adminId = await ensureAdmin();
    await ensureCompany();

    const customerId = await ensureCustomer("Myanmar Aye Thar Yar Co., Ltd.", [
      "Daw Aye Chan",
      "MYA-998877665",
      "No. 45, Baho Road, Ahlone Township, Yangon\nအမှတ် ၄၅၊ ဗဟိုလမ်း၊ အလုံမြို့နယ်၊ ရန်ကုန်မြို့",
      "Yangon",
      "+95 9 987 654 321",
      "procurement@ayetharyar.example",
      "USD",
      "Demo customer for the quotation seed.",
    ]);

    await ensureCustomer("Bagan Digital Solutions", [
      "U Min Thu",
      "MYA-112233445",
      "No. 12, 78th Street, Chanayethazan Township, Mandalay",
      "Mandalay",
      "+95 9 555 111 222",
      "hello@bagandigital.example",
      "MMK",
      null,
    ]);

    await ensureProduct({
      sku: "VT-SW-9200",
      name: "Cisco Catalyst 9200 24-Port Switch",
      description: "24-port PoE+ managed switch with 4× 1G SFP uplinks.",
      category: "Network",
      unit: "pcs",
      costPriceMmk: 2_100_000,
      taxRate: 0.05,
      prices: { MMK: 3_200_000, USD: 745, THB: 26_500 },
    });
    await ensureProduct({
      sku: "VT-AP-6E",
      name: "UniFi U6 Enterprise Access Point",
      description: "Wi-Fi 6E ceiling access point, PoE powered.",
      category: "Network",
      unit: "pcs",
      costPriceMmk: 210_000,
      taxRate: 0.05,
      prices: { MMK: 320_000, USD: 75, THB: 2_700 },
    });
    await ensureProduct({
      sku: "VT-FW-60F",
      name: "FortiGate 60F Firewall",
      description: "Branch firewall with 10 GE ports and SD-WAN.",
      category: "Security",
      unit: "pcs",
      costPriceMmk: 650_000,
      taxRate: 0.05,
      prices: { MMK: 980_000, USD: 230, THB: 8_200 },
    });
    await ensureProduct({
      sku: "VT-CAB-CAT6",
      name: "Cat6 UTP cable — 305 m box",
      description: "Solid copper Cat6 cable, 305 m pull box.",
      category: "Cabling",
      unit: "box",
      costPriceMmk: 95_000,
      taxRate: 0.05,
      prices: { MMK: 145_000, USD: 34, THB: 1_200 },
    });
    await ensureProduct({
      sku: "VT-SVC-INST",
      name: "Installation, configuration and testing",
      description: "On-site installation, configuration, labelling and testing.",
      category: "Services",
      unit: "lot",
      costPriceMmk: 300_000,
      taxRate: 0.05,
      prices: { MMK: 600_000, USD: 140, THB: 5_000 },
    });

    await ensureRates();
    await ensureDemoQuote(adminId, customerId);
    await client.query("commit");
    console.log("[seed] complete");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[seed] failed", error);
  process.exit(1);
});
