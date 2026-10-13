import "dotenv/config";
import { createHash } from "node:crypto";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().trim().optional(),
  JWT_SECRET: z.string().trim().optional(),
  JWT_EXPIRES_IN: z.string().default("7d"),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z.string().trim().default("gemini-2.5-flash"),
  CORS_ORIGINS: z.string().optional(),
  ALLOW_SIGNUP: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  SEED_DEMO_DATA: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  DATA_FILE: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().default(600),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

const raw = parsed.data;
const warnings: string[] = [];

let jwtSecret = raw.JWT_SECRET;
if (!jwtSecret) {
  // Derive a stable secret so tokens survive across serverless instances.
  jwtSecret = raw.DATABASE_URL
    ? createHash("sha256").update(`supportflow:${raw.DATABASE_URL}`).digest("hex")
    : "supportflow-demo-secret-change-me";
  warnings.push("JWT_SECRET is not set — using a derived fallback. Set JWT_SECRET in production.");
}
if (!raw.DATABASE_URL) {
  warnings.push("DATABASE_URL is not set — using the local file store. Set DATABASE_URL (e.g. Neon Postgres) for durable data.");
}
if (!raw.GEMINI_API_KEY) {
  warnings.push("GEMINI_API_KEY is not set — AI analysis uses the built-in rule-based classifier.");
}

export const env = {
  ...raw,
  DATABASE_URL: raw.DATABASE_URL || undefined,
  GEMINI_API_KEY: raw.GEMINI_API_KEY || undefined,
  JWT_SECRET: jwtSecret,
  isVercel: Boolean(process.env.VERCEL),
  isProd: raw.NODE_ENV === "production",
  corsOrigins: (raw.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  warnings,
};
