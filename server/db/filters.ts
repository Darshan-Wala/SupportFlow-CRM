import {
  PRIORITY_RANK,
  TICKET_STATUSES,
  computeSla,
  type Ticket,
  type TicketListItem,
} from "../../shared/domain.js";
import type { TicketQuery } from "./types.js";

const STATUS_RANK = Object.fromEntries(TICKET_STATUSES.map((s, i) => [s, i])) as Record<string, number>;

/** In-memory ticket filter/sort shared by the memory store. */
export function filterTickets(items: TicketListItem[], q: TicketQuery): TicketListItem[] {
  const term = q.search?.trim().toLowerCase();
  let out = items.filter((t) => {
    if (q.status?.length && !q.status.includes(t.status)) return false;
    if (q.priority?.length && !q.priority.includes(t.priority)) return false;
    if (q.category?.length && !q.category.includes(t.category)) return false;
    if (q.channel?.length && !q.channel.includes(t.channel)) return false;
    if (q.customerId && t.customerId !== q.customerId) return false;
    if (q.assignee === "unassigned" && t.assigneeId) return false;
    if (q.assignee && q.assignee !== "unassigned" && t.assigneeId !== q.assignee) return false;
    if (q.sla && t.sla.state !== q.sla) return false;
    if (term) {
      const hay = [
        t.key,
        String(t.number),
        t.subject,
        t.description,
        t.customer.name,
        t.customer.email,
        t.customer.company ?? "",
        ...(t.ai?.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  const dir = q.order === "asc" ? 1 : -1;
  out = out.sort((a, b) => {
    let cmp = 0;
    switch (q.sort) {
      case "priority":
        cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        break;
      case "status":
        cmp = STATUS_RANK[a.status]! - STATUS_RANK[b.status]!;
        break;
      case "number":
        cmp = a.number - b.number;
        break;
      case "updatedAt":
        cmp = a.updatedAt.localeCompare(b.updatedAt);
        break;
      default:
        cmp = a.createdAt.localeCompare(b.createdAt);
    }
    return cmp === 0 ? (b.number - a.number) : cmp * dir;
  });
  return out;
}

export function withSla<T extends Ticket>(t: T) {
  return { ...t, sla: computeSla(t) };
}

export function paginate<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  return {
    data: items.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) },
  };
}
