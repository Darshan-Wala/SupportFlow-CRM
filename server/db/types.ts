import type {
  AIAnalysis,
  ActivityType,
  Customer,
  CustomerHealth,
  CustomerWithStats,
  Paginated,
  Sentiment,
  Ticket,
  TicketActivity,
  TicketCategory,
  TicketChannel,
  TicketListItem,
  TicketNote,
  TicketPriority,
  TicketStatus,
  User,
  UserRole,
  Workspace,
} from "../../shared/domain.js";

/**
 * Every customer / ticket / note belongs to a workspace. All store methods that touch
 * tenant data take the workspace id (`ws`) first, so data can never leak across accounts.
 */

export interface UserRecord extends User {
  passwordHash: string;
}

export interface NewUser {
  workspaceId: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
}

export interface NewCustomer {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  health?: CustomerHealth;
  notes?: string | null;
}

export interface CustomerQuery {
  page: number;
  limit: number;
  search?: string;
  health?: CustomerHealth;
  sort: "name" | "createdAt" | "tickets" | "lastTicketAt";
  order: "asc" | "desc";
}

export interface NewTicket {
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  channel: TicketChannel;
  customerId: string;
  assigneeId: string | null;
  ai: AIAnalysis | null;
}

export type TicketPatch = Partial<
  Pick<
    Ticket,
    | "subject"
    | "description"
    | "status"
    | "priority"
    | "category"
    | "channel"
    | "assigneeId"
    | "ai"
    | "firstResponseAt"
    | "resolvedAt"
  >
>;

export interface TicketQuery {
  page: number;
  limit: number;
  search?: string;
  status?: TicketStatus[];
  priority?: TicketPriority[];
  category?: TicketCategory[];
  channel?: TicketChannel[];
  /** user id, or "unassigned" */
  assignee?: string;
  customerId?: string;
  sla?: "breached" | "at_risk";
  sort: "createdAt" | "updatedAt" | "priority" | "status" | "number";
  order: "asc" | "desc";
}

/** Lightweight projection used for dashboards & analytics. */
export interface TicketMetricRow {
  id: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  channel: TicketChannel;
  assigneeId: string | null;
  customerId: string;
  sentiment: Sentiment | null;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
}

export interface Store {
  readonly kind: "postgres" | "memory";
  init(): Promise<void>;

  workspaces: {
    create(name: string): Promise<Workspace>;
    get(id: string): Promise<Workspace | null>;
    rename(id: string, name: string): Promise<Workspace | null>;
  };

  users: {
    findByEmail(email: string): Promise<UserRecord | null>;
    findById(id: string): Promise<UserRecord | null>;
    list(ws: string): Promise<User[]>;
    create(data: NewUser): Promise<User>;
    update(
      ws: string,
      id: string,
      patch: Partial<Pick<UserRecord, "name" | "role" | "passwordHash">>,
    ): Promise<User | null>;
    delete(ws: string, id: string): Promise<boolean>;
  };

  customers: {
    list(ws: string, q: CustomerQuery): Promise<Paginated<CustomerWithStats>>;
    get(ws: string, id: string): Promise<CustomerWithStats | null>;
    findByEmail(ws: string, email: string): Promise<Customer | null>;
    create(ws: string, data: NewCustomer): Promise<Customer>;
    update(ws: string, id: string, patch: Partial<NewCustomer>): Promise<Customer | null>;
    delete(ws: string, id: string): Promise<boolean>;
  };

  tickets: {
    list(ws: string, q: TicketQuery): Promise<Paginated<TicketListItem>>;
    get(ws: string, idOrKey: string): Promise<TicketListItem | null>;
    create(ws: string, data: NewTicket): Promise<Ticket>;
    update(ws: string, id: string, patch: TicketPatch): Promise<Ticket | null>;
    delete(ws: string, id: string): Promise<boolean>;
    notes(ws: string, ticketId: string): Promise<TicketNote[]>;
    addNote(ws: string, data: Omit<TicketNote, "id" | "createdAt">): Promise<TicketNote>;
    activities(ws: string, ticketId: string): Promise<TicketActivity[]>;
    addActivity(
      ws: string,
      data: { ticketId: string; actorName: string; type: ActivityType; message: string },
    ): Promise<TicketActivity>;
    /** Tickets created/resolved since `since`, plus every ticket still active. */
    metrics(ws: string, since: Date): Promise<TicketMetricRow[]>;
  };
}
