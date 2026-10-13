/**
 * Shared domain model — imported by both the API (server/) and the web app (src/).
 * Keep this file dependency-free so it can run anywhere.
 */

export const TICKET_STATUSES = ["Open", "In Progress", "Pending", "Resolved", "Closed"] as const;
export const TICKET_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export const TICKET_CATEGORIES = [
  "Billing",
  "Technical",
  "Account",
  "Bug",
  "Feature Request",
  "General",
] as const;
export const TICKET_CHANNELS = ["Email", "Chat", "Phone", "Web"] as const;
export const CUSTOMER_HEALTH = ["Active", "At Risk", "VIP"] as const;
export const SENTIMENTS = ["Positive", "Neutral", "Negative"] as const;
export const USER_ROLES = ["admin", "agent"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketChannel = (typeof TICKET_CHANNELS)[number];
export type CustomerHealth = (typeof CUSTOMER_HEALTH)[number];
export type Sentiment = (typeof SENTIMENTS)[number];
export type UserRole = (typeof USER_ROLES)[number];

/** Statuses that count as "work remaining". */
export const ACTIVE_STATUSES: TicketStatus[] = ["Open", "In Progress", "Pending"];
export const DONE_STATUSES: TicketStatus[] = ["Resolved", "Closed"];

export const PRIORITY_RANK: Record<TicketPriority, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Urgent: 4,
};

/** Resolution SLA targets (hours) by priority. */
export const SLA_HOURS: Record<TicketPriority, number> = {
  Urgent: 4,
  High: 24,
  Medium: 48,
  Low: 72,
};

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}

export interface User {
  id: string;
  workspaceId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Customer {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  health: CustomerHealth;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerWithStats extends Customer {
  ticketCount: number;
  openTicketCount: number;
  lastTicketAt: string | null;
}

export interface AIAnalysis {
  category: TicketCategory;
  priority: TicketPriority;
  sentiment: Sentiment;
  summary: string;
  suggestedReply: string;
  tags: string[];
  confidence: number;
  source: "gemini" | "heuristic";
  model: string | null;
  analyzedAt: string;
}

export interface SlaInfo {
  dueAt: string;
  targetHours: number;
  state: "ok" | "at_risk" | "breached" | "met";
}

export interface Ticket {
  id: string;
  workspaceId: string;
  number: number;
  key: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  channel: TicketChannel;
  customerId: string;
  assigneeId: string | null;
  ai: AIAnalysis | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListItem extends Ticket {
  customer: Pick<Customer, "id" | "name" | "email" | "company" | "health">;
  assignee: Pick<User, "id" | "name" | "email"> | null;
  sla: SlaInfo;
}

export interface TicketNote {
  id: string;
  ticketId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  internal: boolean;
  createdAt: string;
}

export type ActivityType =
  | "created"
  | "status"
  | "priority"
  | "category"
  | "assignment"
  | "note"
  | "reply"
  | "ai"
  | "updated";

export interface TicketActivity {
  id: string;
  ticketId: string;
  actorName: string;
  type: ActivityType;
  message: string;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; pageCount: number };
}

export function ticketKey(n: number) {
  return `TKT-${n}`;
}

export function computeSla(
  t: Pick<Ticket, "priority" | "createdAt" | "resolvedAt" | "status">,
  now = Date.now(),
): SlaInfo {
  const targetHours = SLA_HOURS[t.priority];
  const created = new Date(t.createdAt).getTime();
  const due = created + targetHours * 3_600_000;
  const done = DONE_STATUSES.includes(t.status);
  const end = done && t.resolvedAt ? new Date(t.resolvedAt).getTime() : now;
  let state: SlaInfo["state"];
  if (done) state = end <= due ? "met" : "breached";
  else if (end > due) state = "breached";
  else if (due - end < targetHours * 3_600_000 * 0.25) state = "at_risk";
  else state = "ok";
  return { dueAt: new Date(due).toISOString(), targetHours, state };
}
