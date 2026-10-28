// Neon Postgres over HTTP (@neondatabase/serverless). Created lazily so builds and pages without DATABASE_URL still work.
import { neon } from "@neondatabase/serverless";
let sql;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  // no-store: Next.js 14 patches fetch() and could otherwise serve cached query results from its data cache.
  return (sql ??= neon(process.env.DATABASE_URL, { fetchOptions: { cache: "no-store" } }));
}
