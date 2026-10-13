import { Router } from "express";
import { z } from "zod";
import { CUSTOMER_HEALTH } from "../../shared/domain.js";
import { ApiError } from "../lib/errors.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const customerInput = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: optionalText(40),
  company: optionalText(120),
  health: z.enum(CUSTOMER_HEALTH).default("Active"),
  notes: optionalText(2000),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  health: z.enum(CUSTOMER_HEALTH).optional().catch(undefined),
  sort: z.enum(["name", "createdAt", "tickets", "lastTicketAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

router.get("/", async (req, res) => {
  res.json(await req.store.customers.list(req.user.workspaceId, listSchema.parse(req.query)));
});

router.post("/", async (req, res) => {
  const body = customerInput.parse(req.body);
  if (await req.store.customers.findByEmail(req.user.workspaceId, body.email)) {
    throw ApiError.conflict("A customer with this email already exists");
  }
  res.status(201).json({ data: await req.store.customers.create(req.user.workspaceId, body) });
});

router.get("/:id", async (req, res) => {
  const c = await req.store.customers.get(req.user.workspaceId, req.params.id as string);
  if (!c) throw ApiError.notFound("Customer not found");
  res.json({ data: c });
});

router.patch("/:id", async (req, res) => {
  const body = customerInput.partial().parse(req.body);
  const ws = req.user.workspaceId;
  if (body.email) {
    const existing = await req.store.customers.findByEmail(ws, body.email);
    if (existing && existing.id !== req.params.id) throw ApiError.conflict("Another customer already uses this email");
  }
  const c = await req.store.customers.update(ws, req.params.id as string, body);
  if (!c) throw ApiError.notFound("Customer not found");
  res.json({ data: c });
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const ok = await req.store.customers.delete(req.user.workspaceId, req.params.id as string);
  if (!ok) throw ApiError.notFound("Customer not found");
  res.status(204).end();
});

export default router;
