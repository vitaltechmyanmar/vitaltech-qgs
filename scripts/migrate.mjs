#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "db", "migrations");
const connectionString =
  process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("MIGRATION_DATABASE_URL (or DATABASE_URL) is not set");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: /sslmode=require/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
});

const LOCK_KEY = 7283741;

async function main() {
  await client.connect();
  await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);

  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename   text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = new Map(
      (
        await client.query("select filename, checksum from schema_migrations")
      ).rows.map((row) => [row.filename, row.checksum]),
    );

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = applied.get(file);

      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `${file} was modified after it was applied (checksum mismatch). ` +
              "Add a new migration instead of editing history.",
          );
        }
        continue;
      }

      console.log(`[migrate] applying ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (filename, checksum) values ($1, $2)",
          [file, checksum],
        );
        await client.query("commit");
        count += 1;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    console.log(
      count === 0
        ? "[migrate] database is up to date"
        : `[migrate] applied ${count} migration(s)`,
    );
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

main().catch((error) => {
  console.error("[migrate] failed", error);
  process.exit(1);
});
