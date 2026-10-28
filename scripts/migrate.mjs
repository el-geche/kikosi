// Applies db/schema.sql (idempotent) and syncs the badge catalogue from lib/game.js.
// Usage: npm run db:migrate   (reads .env.local; pull it with `vercel env pull .env.local`)
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { BADGES } from "../lib/game.js";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set. Run `vercel env pull .env.local` first."); process.exit(1); }
const sql = neon(url);
const text = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
// Split on ";" outside $$ ... $$ function bodies.
const clean = text.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const statements = []; let buf = "", inBody = false;
for (let i = 0; i < clean.length; i++) {
  if (clean.startsWith("$$", i)) { inBody = !inBody; buf += "$$"; i++; continue; }
  if (clean[i] === ";" && !inBody) { if (buf.trim()) statements.push(buf.trim()); buf = ""; continue; }
  buf += clean[i];
}
if (buf.trim()) statements.push(buf.trim());
for (const s of statements) await sql.query(s);
for (const b of BADGES)
  await sql`insert into badges (id, name, description, icon, sort) values (${b.id}, ${b.name}, ${b.description}, ${b.icon}, ${b.sort})
    on conflict (id) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, sort = excluded.sort`;
const tables = await sql.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by table_name");
console.log(`Applied ${statements.length} statements, ${BADGES.length} badges. Tables: ${tables.map((t) => t.table_name).join(", ")}`);
