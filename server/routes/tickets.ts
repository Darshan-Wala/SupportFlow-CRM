import { Router } from "express";
import { z } from "zod";
import {
  TICKET_CATEGORIES,
  TICKET_CHANNELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketListItem,
} from "../../shared/domain.js";
import type { TicketQuery } from "../db/types.js";
import { ApiError } from "../lib/errors.js";
import { requireAdmin } from "../middleware/auth.js";
import { analyzeTicket } from "../services/ai.js";
import { applyTicketUpdate, getTicketOr404, ticketsToCsv } from "../services/tickets.js";
import { customerInput } from "./customers.js";

const router = Router();

/** Accepts `status=Open,Pending` or repeated params and validates each value. */
const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v == null ? undefined : (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean)))
    .pipe(z.array(z.enum(values)).optional())
    .transform((v) => (v?.length ? v : undefined));

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: csvEnum(TICKET_STATUSES),
  priority: csvEnum(TICKET_PRIORITIES),
  category: csvEnum(TICKET_CATEGORIES),
  channel: csvEnum(TICKET_CHANNELS),
  assignee: z.string().trim().optional(),
  customerId: z.string().trim().optional(),
  sla: z.enum(["breached", "at_risk"]).optional(),
  sort: z.enum(["createdAt", "updatedAt", "priority", "status", "number"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

function parseQuery(query: unknown, userId: string): TicketQuery {
  const q = listSchema.parse(query);
  return { ...q, assignee: q.assignee === "me" ? userId : q.assignee || undefined };
}

router.get("/", async (req, res) => {
  res.json(await req.store.tickets.list(req.user.workspaceId, parseQuery(req.query, req.user.id)));
});

router.get("/export", async (req, res) => {
  const q = { ...parseQuery(req.query, req.user.id), page: 1, limit: 100 };
  const all: TicketListItem[] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await req.store.tickets.list(req.user.workspaceId, { ...q, page });
    all.push(...r.data);
    if (page >= r.meta.pageCount) break;
  }
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="supportflow-tickets-${date}.csv"`);
  res.send("﻿" + ticketsToCsv(all));
});

const createSchema = z
  .object({
    subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(200),
    description: z.string().trim().min(10, "Description must be at least 10 characters").max(10_000),
    customerId: z.string().trim().optional(),
    customer: customerInput.pick({ name: true, email: true, company: true, phone: true }).optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    status: z.enum(TICKET_STATUSES).default("Open"),
    channel: z.enum(TICKET_CHANNELS).default("Web"),
    assigneeId: z.string().trim().nullable().optional(),
  })
  .refine((d) => d.customerId || d.customer, { message: "Choose an existing customer or add a new one", path: ["customerId"] });

router.post("/", async (req, res) => {
  const body = createSchema.parse(req.body);
  const ws = req.user.workspaceId;
  const store = req.store;

  let customer = body.customerId ? await store.customers.get(ws, body.customerId) : null;
  if (body.customerId && !customer) throw ApiError.badRequest("Customer not found");
  if (!customer && body.customer) {
    const existing = await store.customers.findByEmail(ws, body.customer.email);
    customer = existing
      ? await store.customers.get(ws, existing.id)
      : await store.customers.get(ws, (await store.customers.create(ws, { ...body.customer, health: "Active" })).id);
  }
  if (!customer) throw ApiError.badRequest("Customer is required");

  let assigneeName: string | null = null;
  if (body.assigneeId) {
    const a = await store.users.findById(body.assigneeId);
    if (!a || a.workspaceId !== ws) throw ApiError.badRequest("Assignee is not a member of this workspace");
    assigneeName = a.name;
  }

  const ai = await analyzeTicket({
    subject: body.subject,
    description: body.description,
    customerName: customer.name,
    customerHealth: customer.health,
  });

  const ticket = await store.tickets.create(ws, {
    subject: body.subject,
    description: body.description,
    status: body.status,
    channel: body.channel,
    category: body.category ?? ai.category,
    priority: body.priority ?? ai.priority,
    customerId: customer.id,
    assigneeId: body.assigneeId ?? null,
    ai,
  });

  const log = (type: Parameters<typeof store.tickets.addActivity>[1]["type"], message: string, actorName = req.user.name) =>
    store.tickets.addActivity(ws, { ticketId: ticket.id, actorName, type, message });
  await log("created", `Ticket created via ${ticket.channel} for ${customer.name}`);
  await log(
    "ai",
    `${ai.source === "gemini" ? "Gemini" : "Rule-based classifier"} suggested ${ai.category} · ${ai.priority} priority · ${ai.sentiment} sentiment` +
      (body.category || body.priority ? " (agent overrides kept)" : ""),
    "SupportFlow AI",
  );
  if (assigneeName) await log("assignment", `Assigned to ${assigneeName}`);

  res.status(201).json({ data: await store.tickets.get(ws, ticket.id) });
});

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(["update", "delete"]),
  patch: z
    .object({
      status: z.enum(TICKET_STATUSES).optional(),
      priority: z.enum(TICKET_PRIORITIES).optional(),
      category: z.enum(TICKET_CATEGORIES).optional(),
      assigneeId: z.string().nullable().optional(),
    })
    .optional(),
});

router.post("/bulk", async (req, res) => {
  const body = bulkSchema.parse(req.body);
  const ws = req.user.workspaceId;
  if (body.action === "delete" && req.user.role !== "admin") throw ApiError.forbidden("Only admins can delete tickets");
  let affected = 0;
  for (const id of body.ids) {
    const t = await req.store.tickets.get(ws, id);
    if (!t) continue;
    if (body.action === "delete") {
      if (await req.store.tickets.delete(ws, t.id)) affected++;
    } else if (body.patch) {
      await applyTicketUpdate(req.store, req.user, t, body.patch);
      affected++;
    }
  }
  res.json({ data: { affected } });
});

router.get("/:id", async (req, res) => {
  const ws = req.user.workspaceId;
  const ticket = await getTicketOr404(req.store, ws, req.params.id as string);
  const [notes, activities] = await Promise.all([
    req.store.tickets.notes(ws, ticket.id),
    req.store.tickets.activities(ws, ticket.id),
  ]);
  res.json({ data: { ticket, notes, activities } });
});

const updateSchema = z.object({
  subject: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().min(10).max(10_000).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  channel: z.enum(TICKET_CHANNELS).optional(),
  assigneeId: z.string().nullable().optional(),
});

router.patch("/:id", async (req, res) => {
  const body = updateSchema.parse(req.body);
  const ticket = await getTicketOr404(req.store, req.user.workspaceId, req.params.id as string);
  res.json({ data: await applyTicketUpdate(req.store, req.user, ticket, body) });
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const ticket = await getTicketOr404(req.store, req.user.workspaceId, req.params.id as string);
  await req.store.tickets.delete(req.user.workspaceId, ticket.id);
  res.status(204).end();
});

const noteSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(10_000),
  internal: z.boolean().default(true),
});

router.post("/:id/notes", async (req, res) => {
  const { body, internal } = noteSchema.parse(req.body);
  const ws = req.user.workspaceId;
  let ticket = await getTicketOr404(req.store, ws, req.params.id as string);
  const note = await req.store.tickets.addNote(ws, {
    ticketId: ticket.id,
    authorId: req.user.id,
    authorName: req.user.name,
    body,
    internal,
  });
  await req.store.tickets.addActivity(ws, {
    ticketId: ticket.id,
    actorName: req.user.name,
    type: internal ? "note" : "reply",
    message: internal ? "Added an internal note" : "Replied to the customer",
  });
  if (!internal) {
    if (ticket.status === "Open") {
      ticket = await applyTicketUpdate(req.store, req.user, ticket, { status: "In Progress" });
    }
    if (!ticket.firstResponseAt) {
      await req.store.tickets.update(ws, ticket.id, { firstResponseAt: note.createdAt });
    }
  }
  res.status(201).json({ data: note });
});

router.post("/:id/analyze", async (req, res) => {
  const ws = req.user.workspaceId;
  const ticket = await getTicketOr404(req.store, ws, req.params.id as string);
  const ai = await analyzeTicket({
    subject: ticket.subject,
    description: ticket.description,
    customerName: ticket.customer.name,
    customerHealth: ticket.customer.health,
  });
  await req.store.tickets.update(ws, ticket.id, { ai });
  await req.store.tickets.addActivity(ws, {
    ticketId: ticket.id,
    actorName: "SupportFlow AI",
    type: "ai",
    message: `Re-analysed by ${ai.source === "gemini" ? "Gemini" : "rule-based classifier"}: ${ai.category} · ${ai.priority} · ${ai.sentiment}`,
  });
  res.json({ data: await req.store.tickets.get(ws, ticket.id) });
});

export default router;
