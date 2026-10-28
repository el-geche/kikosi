// Applies db/schema.sql (idempotent) to the database in DATABASE_URL_UNPOOLED or DATABASE_URL.
// Usage: npm run db:migrate   (reads .env.local; pull it with `vercel env pull .env.local`)
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set. Run `vercel env pull .env.local` first."); process.exit(1); }
const sql = neon(url);
const text = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const statements = text.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);
for (const s of statements) await sql.query(s);
const tables = await sql.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by table_name");
console.log(`Applied ${statements.length} statements. Tables: ${tables.map((t) => t.table_name).join(", ")}`);
