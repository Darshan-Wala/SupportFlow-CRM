/** Creates the Postgres schema. Usage: DATABASE_URL=... npm run db:migrate */
import { env } from "../config/env.js";
import { PostgresStore } from "../db/postgres.js";

if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env first.");
  process.exit(1);
}
const store = new PostgresStore(env.DATABASE_URL, { serverless: false });
await store.init();
console.log("Schema is up to date.");
await store.end();
