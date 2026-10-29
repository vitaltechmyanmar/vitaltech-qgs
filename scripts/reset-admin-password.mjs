
import { Client } from "pg";
import { hash } from "argon2";
import { randomBytes } from "node:crypto";

const email = (
  process.env.SEED_ADMIN_EMAIL ?? "admin@vitaltechmyanmar.com"
).toLowerCase();

const password = process.env.SEED_ADMIN_PASSWORD;

if (!password) {
  throw new Error("SEED_ADMIN_PASSWORD must be provided");
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const client = new Client({
  connectionString,
  ssl: /sslmode=require/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
});

const passwordHash = await hash(password, {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

try {
  await client.connect();

  await client.query("BEGIN");

  const result = await client.query(
    `UPDATE users
     SET password_hash = $1,
         must_change_password = false
     WHERE lower(email) = lower($2)
       AND role = 'admin'
       AND is_active = true
     RETURNING id, email`,
    [passwordHash, email],
  );

  if (result.rowCount !== 1) {
    throw new Error(
      `Expected one active admin account; updated ${result.rowCount}`,
    );
  }

  await client.query("COMMIT");

  console.log(`Password reset successfully for ${result.rows[0].email}`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Password reset failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
