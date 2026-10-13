/** Standalone server for local development and container hosts (Render, Railway, Fly...). */
import { existsSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { env } from "./config/env.js";
import app from "./app.js";
import { getStore } from "./db/index.js";

// When a production build of the web app exists, serve it too (single-service deploys).
const dist = join(process.cwd(), "dist");
if (env.isProd && existsSync(join(dist, "index.html"))) {
  app.use(express.static(dist, { maxAge: "1h", index: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, "index.html")));
}

getStore()
  .then((store) => {
    app.listen(env.PORT, () => {
      console.log(`\n  SupportFlow API ready on http://localhost:${env.PORT}/api`);
      console.log(`  Database: ${store.kind}${store.kind === "memory" ? " (local JSON file — set DATABASE_URL for Postgres)" : ""}`);
      console.log(`  AI: ${env.GEMINI_API_KEY ? `Gemini (${env.GEMINI_MODEL})` : "rule-based fallback (set GEMINI_API_KEY)"}`);
      env.warnings.forEach((w) => console.warn(`  ! ${w}`));
    });
  })
  .catch((err) => {
    console.error("Failed to initialise the database:", err);
    process.exit(1);
  });
