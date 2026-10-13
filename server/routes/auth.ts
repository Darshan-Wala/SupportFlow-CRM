import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../config/env.js";
import { ApiError } from "../lib/errors.js";
import { requireAuth, signToken } from "../middleware/auth.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { message: "Too many attempts. Please wait a few minutes and try again." } },
});

const email = z.string().trim().toLowerCase().email("Enter a valid email address");
const password = z.string().min(8, "Password must be at least 8 characters").max(128);

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email,
  password,
  workspaceName: z.string().trim().min(2, "Workspace name must be at least 2 characters").max(80),
});

const loginSchema = z.object({ email, password: z.string().min(1, "Password is required") });

router.post("/register", authLimiter, async (req, res) => {
  if (!env.ALLOW_SIGNUP) throw ApiError.forbidden("Sign-ups are disabled. Ask your workspace admin for an invite.");
  const body = registerSchema.parse(req.body);
  if (await req.store.users.findByEmail(body.email)) {
    throw ApiError.conflict("An account with this email already exists. Try signing in.");
  }
  const workspace = await req.store.workspaces.create(body.workspaceName);
  const user = await req.store.users.create({
    workspaceId: workspace.id,
    email: body.email,
    name: body.name,
    role: "admin",
    passwordHash: await bcrypt.hash(body.password, 10),
  });
  res.status(201).json({ data: { token: signToken(user), user, workspace } });
});

router.post("/login", authLimiter, async (req, res) => {
  const body = loginSchema.parse(req.body);
  const record = await req.store.users.findByEmail(body.email);
  const ok = record ? await bcrypt.compare(body.password, record.passwordHash) : false;
  if (!record || !ok) throw ApiError.unauthorized("Incorrect email or password");
  const { passwordHash: _p, ...user } = record;
  const workspace = await req.store.workspaces.get(user.workspaceId);
  res.json({ data: { token: signToken(user), user, workspace } });
});

router.get("/me", requireAuth, async (req, res) => {
  const workspace = await req.store.workspaces.get(req.user.workspaceId);
  res.json({ data: { user: req.user, workspace } });
});

const updateMeSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    currentPassword: z.string().optional(),
    newPassword: password.optional(),
  })
  .refine((d) => !d.newPassword || d.currentPassword, {
    message: "Current password is required to set a new password",
    path: ["currentPassword"],
  });

router.patch("/me", requireAuth, async (req, res) => {
  const body = updateMeSchema.parse(req.body);
  let passwordHash: string | undefined;
  if (body.newPassword) {
    const record = await req.store.users.findById(req.user.id);
    if (!record || !(await bcrypt.compare(body.currentPassword!, record.passwordHash))) {
      throw ApiError.badRequest("Current password is incorrect");
    }
    passwordHash = await bcrypt.hash(body.newPassword, 10);
  }
  const user = await req.store.users.update(req.user.workspaceId, req.user.id, { name: body.name, passwordHash });
  res.json({ data: user });
});

export default router;
