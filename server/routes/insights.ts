import { Router } from "express";
import { z } from "zod";
import { analyzeTicket } from "../services/ai.js";
import { buildAnalytics, buildDashboard } from "../services/analytics.js";

const router = Router();

const tz = z.coerce.number().int().min(-840).max(840).default(0);

router.get("/dashboard", async (req, res) => {
  const { tzOffset } = z.object({ tzOffset: tz }).parse(req.query);
  res.json({ data: await buildDashboard(req.store, req.user, tzOffset) });
});

router.get("/analytics", async (req, res) => {
  const { days, tzOffset } = z
    .object({ days: z.coerce.number().int().refine((d) => [7, 30, 90, 180, 365].includes(d)).default(30), tzOffset: tz })
    .parse(req.query);
  res.json({ data: await buildAnalytics(req.store, req.user.workspaceId, days, tzOffset) });
});

const analyzeSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(10_000),
  customerId: z.string().optional(),
});

/** Preview AI triage while the agent is still writing the ticket. */
router.post("/ai/analyze", async (req, res) => {
  const body = analyzeSchema.parse(req.body);
  const customer = body.customerId ? await req.store.customers.get(req.user.workspaceId, body.customerId) : null;
  res.json({
    data: await analyzeTicket({
      subject: body.subject,
      description: body.description,
      customerName: customer?.name,
      customerHealth: customer?.health,
    }),
  });
});

export default router;
