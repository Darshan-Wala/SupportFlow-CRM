import {
  ACTIVE_STATUSES,
  DONE_STATUSES,
  type ActivityType,
  type TicketCategory,
  type TicketChannel,
  type TicketListItem,
  type TicketPriority,
  type TicketStatus,
  type User,
} from "../../shared/domain.js";
import type { Store, TicketPatch } from "../db/types.js";
import { ApiError } from "../lib/errors.js";

export interface TicketUpdateInput {
  subject?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  channel?: TicketChannel;
  assigneeId?: string | null;
}

/**
 * Applies an update to a ticket, maintaining lifecycle timestamps
 * (first response, resolution) and writing an audit trail entry per change.
 */
export async function applyTicketUpdate(
  store: Store,
  actor: User,
  ticket: TicketListItem,
  input: TicketUpdateInput,
) {
  const ws = actor.workspaceId;
  const patch: TicketPatch = {};
  const log: { type: ActivityType; message: string }[] = [];
  const now = new Date().toISOString();

  if (input.status && input.status !== ticket.status) {
    patch.status = input.status;
    log.push({ type: "status", message: `Status changed from ${ticket.status} to ${input.status}` });
    if (DONE_STATUSES.includes(input.status) && !ticket.resolvedAt) patch.resolvedAt = now;
    if (ACTIVE_STATUSES.includes(input.status) && ticket.resolvedAt) patch.resolvedAt = null;
    if (ticket.status === "Open" && input.status !== "Open" && !ticket.firstResponseAt) patch.firstResponseAt = now;
  }
  if (input.priority && input.priority !== ticket.priority) {
    patch.priority = input.priority;
    log.push({ type: "priority", message: `Priority changed from ${ticket.priority} to ${input.priority}` });
  }
  if (input.category && input.category !== ticket.category) {
    patch.category = input.category;
    log.push({ type: "category", message: `Category changed from ${ticket.category} to ${input.category}` });
  }
  if (input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) {
    if (input.assigneeId === null) {
      patch.assigneeId = null;
      log.push({ type: "assignment", message: "Ticket unassigned" });
    } else {
      const assignee = await store.users.findById(input.assigneeId);
      if (!assignee || assignee.workspaceId !== ws) throw ApiError.badRequest("Assignee is not a member of this workspace");
      patch.assigneeId = assignee.id;
      log.push({ type: "assignment", message: `Assigned to ${assignee.name}` });
    }
  }
  const detailChanges: string[] = [];
  if (input.subject !== undefined && input.subject !== ticket.subject) {
    patch.subject = input.subject;
    detailChanges.push("subject");
  }
  if (input.description !== undefined && input.description !== ticket.description) {
    patch.description = input.description;
    detailChanges.push("description");
  }
  if (input.channel && input.channel !== ticket.channel) {
    patch.channel = input.channel;
    detailChanges.push("channel");
  }
  if (detailChanges.length) log.push({ type: "updated", message: `Updated ${detailChanges.join(", ")}` });

  if (Object.keys(patch).length === 0) return ticket;

  await store.tickets.update(ws, ticket.id, patch);
  for (const entry of log) {
    await store.tickets.addActivity(ws, { ticketId: ticket.id, actorName: actor.name, ...entry });
  }
  return (await store.tickets.get(ws, ticket.id))!;
}

export async function getTicketOr404(store: Store, ws: string, idOrKey: string) {
  const t = await store.tickets.get(ws, idOrKey);
  if (!t) throw ApiError.notFound(`Ticket ${idOrKey} not found`);
  return t;
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s;
};

export function ticketsToCsv(items: TicketListItem[]) {
  const header = [
    "Ticket",
    "Subject",
    "Status",
    "Priority",
    "Category",
    "Channel",
    "Customer",
    "Customer Email",
    "Company",
    "Assignee",
    "Sentiment",
    "SLA",
    "Created At",
    "Updated At",
    "First Response At",
    "Resolved At",
  ];
  const rows = items.map((t) => [
    t.key,
    t.subject,
    t.status,
    t.priority,
    t.category,
    t.channel,
    t.customer.name,
    t.customer.email,
    t.customer.company,
    t.assignee?.name ?? "Unassigned",
    t.ai?.sentiment ?? "",
    t.sla.state,
    t.createdAt,
    t.updatedAt,
    t.firstResponseAt ?? "",
    t.resolvedAt ?? "",
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
