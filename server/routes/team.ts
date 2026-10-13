import bcrypt from "bcryptjs";
import { Router, type Request } from "express";
import { z } from "zod";
import { USER_ROLES } from "../../shared/domain.js";
import { ApiError } from "../lib/errors.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/users", async (req, res) => {
  res.json({ data: await req.store.users.list(req.user.workspaceId) });
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: z.enum(USER_ROLES).default("agent"),
});

router.post("/users", requireAdmin, async (req, res) => {
  const body = createSchema.parse(req.body);
  if (await req.store.users.findByEmail(body.email)) throw ApiError.conflict("A user with this email already exists");
  const user = await req.store.users.create({
    workspaceId: req.user.workspaceId,
    email: body.email,
    name: body.name,
    role: body.role,
    passwordHash: await bcrypt.hash(body.password, 10),
  });
  res.status(201).json({ data: user });
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(USER_ROLES).optional(),
});

async function adminCount(req: Request) {
  return (await req.store.users.list(req.user.workspaceId)).filter((u) => u.role === "admin").length;
}

router.patch("/users/:id", requireAdmin, async (req, res) => {
  const body = updateSchema.parse(req.body);
  const target = await req.store.users.findById(req.params.id as string);
  if (!target || target.workspaceId !== req.user.workspaceId) throw ApiError.notFound("User not found");
  if (body.role === "agent" && target.role === "admin" && (await adminCount(req)) <= 1) {
    throw ApiError.badRequest("A workspace needs at least one admin");
  }
  res.json({ data: await req.store.users.update(req.user.workspaceId, target.id, body) });
});

router.delete("/users/:id", requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) throw ApiError.badRequest("You can't remove yourself");
  const ok = await req.store.users.delete(req.user.workspaceId, req.params.id as string);
  if (!ok) throw ApiError.notFound("User not found");
  res.status(204).end();
});

router.patch("/workspace", requireAdmin, async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
  res.json({ data: await req.store.workspaces.rename(req.user.workspaceId, name) });
});

export default router;
