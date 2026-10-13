import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { getStore } from "./db/index.js";
import { requireAuth, withStore } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/error.js";
import authRoutes from "./routes/auth.js";
import customerRoutes from "./routes/customers.js";
import insightRoutes from "./routes/insights.js";
import teamRoutes from "./routes/team.js";
import ticketRoutes from "./routes/tickets.js";
import { aiProvider } from "./services/ai.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      // Same-origin on Vercel needs no CORS; CORS_ORIGINS lets a separately hosted frontend call the API.
      origin: env.corsOrigins.length ? env.corsOrigins : true,
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60_000,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: { message: "Too many requests, please slow down." } },
    }),
  );

  const api = express.Router();

  api.get("/health", async (_req, res) => {
    let database: { kind: string; ok: boolean; error?: string };
    try {
      const store = await getStore();
      database = { kind: store.kind, ok: true };
    } catch (err) {
      database = { kind: env.DATABASE_URL ? "postgres" : "memory", ok: false, error: (err as Error).message };
    }
    res.status(database.ok ? 200 : 503).json({
      data: {
        status: database.ok ? "ok" : "degraded",
        version: "2.0.0",
        database,
        ai: aiProvider(),
        signupEnabled: env.ALLOW_SIGNUP,
        warnings: env.warnings,
        time: new Date().toISOString(),
      },
    });
  });

  api.use(withStore);
  api.use("/auth", authRoutes);
  api.use(requireAuth);
  api.use("/customers", customerRoutes);
  api.use("/tickets", ticketRoutes);
  api.use(teamRoutes);
  api.use(insightRoutes);

  app.use("/api", api);
  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}

const app = createApp();
export default app;
