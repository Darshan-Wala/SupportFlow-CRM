import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  ACTIVE_STATUSES,
  DONE_STATUSES,
  ticketKey,
  type Customer,
  type CustomerWithStats,
  type Ticket,
  type TicketActivity,
  type TicketListItem,
  type TicketNote,
  type User,
  type Workspace,
} from "../../shared/domain.js";
import { filterTickets, paginate, withSla } from "./filters.js";
import type { Store, UserRecord } from "./types.js";

interface State {
  workspaces: (Workspace & { nextTicketNumber: number })[];
  users: UserRecord[];
  customers: Customer[];
  tickets: Ticket[];
  notes: TicketNote[];
  activities: TicketActivity[];
}

const strip = ({ passwordHash: _p, ...u }: UserRecord): User => u;
const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/**
 * Zero-config store for local development (no DATABASE_URL). It starts empty and is
 * persisted to a JSON file (DATA_FILE). On serverless hosts the file lives in /tmp and
 * only survives while the function instance is warm, so use Postgres in production.
 */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private s: State = { workspaces: [], users: [], customers: [], tickets: [], notes: [], activities: [] };
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private file?: string) {}

  async init() {
    if (this.file && existsSync(this.file)) {
      try {
        this.s = { ...this.s, ...(JSON.parse(readFileSync(this.file, "utf8")) as State) };
      } catch (err) {
        console.warn(`[db] Could not read ${this.file}, starting fresh:`, (err as Error).message);
      }
    }
  }

  private persist() {
    if (!this.file) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        mkdirSync(dirname(this.file!), { recursive: true });
        writeFileSync(this.file!, JSON.stringify(this.s));
      } catch (err) {
        console.warn("[db] Failed to persist local data file:", (err as Error).message);
      }
    }, 100);
  }

  private hydrate(t: Ticket): TicketListItem {
    const c = this.s.customers.find((x) => x.id === t.customerId)!;
    const a = t.assigneeId ? this.s.users.find((u) => u.id === t.assigneeId) : null;
    return withSla({
      ...t,
      customer: { id: c.id, name: c.name, email: c.email, company: c.company, health: c.health },
      assignee: a ? { id: a.id, name: a.name, email: a.email } : null,
    });
  }

  private customerStats(c: Customer): CustomerWithStats {
    const ts = this.s.tickets.filter((t) => t.customerId === c.id);
    return {
      ...c,
      ticketCount: ts.length,
      openTicketCount: ts.filter((t) => ACTIVE_STATUSES.includes(t.status)).length,
      lastTicketAt: ts.reduce<string | null>((m, t) => (!m || t.createdAt > m ? t.createdAt : m), null),
    };
  }

  private ticketIn(ws: string, id: string) {
    return this.s.tickets.find((t) => t.id === id && t.workspaceId === ws);
  }

  workspaces: Store["workspaces"] = {
    create: async (name) => {
      const w = { id: randomUUID(), name, createdAt: new Date().toISOString(), nextTicketNumber: 1001 };
      this.s.workspaces.push(w);
      this.persist();
      const { nextTicketNumber: _n, ...pub } = w;
      return pub;
    },
    get: async (id) => {
      const w = this.s.workspaces.find((x) => x.id === id);
      return w ? { id: w.id, name: w.name, createdAt: w.createdAt } : null;
    },
    rename: async (id, name) => {
      const w = this.s.workspaces.find((x) => x.id === id);
      if (!w) return null;
      w.name = name;
      this.persist();
      return { id: w.id, name: w.name, createdAt: w.createdAt };
    },
  };

  users: Store["users"] = {
    findByEmail: async (email) =>
      this.s.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,
    findById: async (id) => this.s.users.find((x) => x.id === id) ?? null,
    list: async (ws) =>
      this.s.users
        .filter((u) => u.workspaceId === ws)
        .map(strip)
        .sort((a, b) => a.name.localeCompare(b.name)),
    create: async (data) => {
      const u: UserRecord = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...data,
        email: data.email.toLowerCase(),
      };
      this.s.users.push(u);
      this.persist();
      return strip(u);
    },
    update: async (ws, id, patch) => {
      const u = this.s.users.find((x) => x.id === id && x.workspaceId === ws);
      if (!u) return null;
      Object.assign(u, defined(patch));
      this.persist();
      return strip(u);
    },
    delete: async (ws, id) => {
      const u = this.s.users.find((x) => x.id === id && x.workspaceId === ws);
      if (!u) return false;
      this.s.users = this.s.users.filter((x) => x !== u);
      this.s.tickets.forEach((t) => {
        if (t.assigneeId === id) t.assigneeId = null;
      });
      this.persist();
      return true;
    },
  };

  customers: Store["customers"] = {
    list: async (ws, q) => {
      const term = q.search?.toLowerCase().trim();
      let rows = this.s.customers
        .filter((c) => c.workspaceId === ws)
        .filter((c) => !q.health || c.health === q.health)
        .filter(
          (c) =>
            !term ||
            [c.name, c.email, c.company ?? "", c.phone ?? ""].join(" ").toLowerCase().includes(term),
        )
        .map((c) => this.customerStats(c));
      const dir = q.order === "asc" ? 1 : -1;
      rows = rows.sort((a, b) => {
        switch (q.sort) {
          case "name":
            return a.name.localeCompare(b.name) * dir;
          case "tickets":
            return (a.ticketCount - b.ticketCount) * dir;
          case "lastTicketAt":
            return (a.lastTicketAt ?? "").localeCompare(b.lastTicketAt ?? "") * dir;
          default:
            return a.createdAt.localeCompare(b.createdAt) * dir;
        }
      });
      return paginate(rows, q.page, q.limit);
    },
    get: async (ws, id) => {
      const c = this.s.customers.find((x) => x.id === id && x.workspaceId === ws);
      return c ? this.customerStats(c) : null;
    },
    findByEmail: async (ws, email) =>
      this.s.customers.find(
        (c) => c.workspaceId === ws && c.email.toLowerCase() === email.toLowerCase(),
      ) ?? null,
    create: async (ws, data) => {
      const now = new Date().toISOString();
      const c: Customer = {
        id: randomUUID(),
        workspaceId: ws,
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone ?? null,
        company: data.company ?? null,
        health: data.health ?? "Active",
        notes: data.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.s.customers.push(c);
      this.persist();
      return c;
    },
    update: async (ws, id, patch) => {
      const c = this.s.customers.find((x) => x.id === id && x.workspaceId === ws);
      if (!c) return null;
      Object.assign(c, defined(patch), { updatedAt: new Date().toISOString() });
      if (patch.email) c.email = patch.email.toLowerCase();
      this.persist();
      return c;
    },
    delete: async (ws, id) => {
      const c = this.s.customers.find((x) => x.id === id && x.workspaceId === ws);
      if (!c) return false;
      this.s.customers = this.s.customers.filter((x) => x !== c);
      const ticketIds = new Set(this.s.tickets.filter((t) => t.customerId === id).map((t) => t.id));
      this.s.tickets = this.s.tickets.filter((t) => !ticketIds.has(t.id));
      this.s.notes = this.s.notes.filter((n) => !ticketIds.has(n.ticketId));
      this.s.activities = this.s.activities.filter((a) => !ticketIds.has(a.ticketId));
      this.persist();
      return true;
    },
  };

  tickets: Store["tickets"] = {
    list: async (ws, q) => {
      const items = filterTickets(
        this.s.tickets.filter((t) => t.workspaceId === ws).map((t) => this.hydrate(t)),
        q,
      );
      return paginate(items, q.page, q.limit);
    },
    get: async (ws, idOrKey) => {
      const key = idOrKey.toUpperCase();
      const t = this.s.tickets.find(
        (x) =>
          x.workspaceId === ws && (x.id === idOrKey || x.key === key || String(x.number) === idOrKey),
      );
      return t ? this.hydrate(t) : null;
    },
    create: async (ws, data) => {
      const w = this.s.workspaces.find((x) => x.id === ws);
      if (!w) throw new Error("Workspace not found");
      const now = new Date().toISOString();
      const number = w.nextTicketNumber++;
      const t: Ticket = {
        id: randomUUID(),
        workspaceId: ws,
        number,
        key: ticketKey(number),
        ...data,
        firstResponseAt: null,
        resolvedAt: DONE_STATUSES.includes(data.status) ? now : null,
        createdAt: now,
        updatedAt: now,
      };
      this.s.tickets.push(t);
      this.persist();
      return t;
    },
    update: async (ws, id, patch) => {
      const t = this.ticketIn(ws, id);
      if (!t) return null;
      Object.assign(t, defined(patch), { updatedAt: new Date().toISOString() });
      // Allow explicit nulls (e.g. unassign, reopen)
      for (const k of ["assigneeId", "resolvedAt", "firstResponseAt"] as const) {
        if (k in patch && patch[k] === null) t[k] = null;
      }
      this.persist();
      return t;
    },
    delete: async (ws, id) => {
      const t = this.ticketIn(ws, id);
      if (!t) return false;
      this.s.tickets = this.s.tickets.filter((x) => x !== t);
      this.s.notes = this.s.notes.filter((n) => n.ticketId !== id);
      this.s.activities = this.s.activities.filter((a) => a.ticketId !== id);
      this.persist();
      return true;
    },
    notes: async (ws, ticketId) =>
      this.ticketIn(ws, ticketId)
        ? this.s.notes
            .filter((n) => n.ticketId === ticketId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : [],
    addNote: async (ws, data) => {
      if (!this.ticketIn(ws, data.ticketId)) throw new Error("Ticket not found");
      const n: TicketNote = { id: randomUUID(), createdAt: new Date().toISOString(), ...data };
      this.s.notes.push(n);
      this.persist();
      return n;
    },
    activities: async (ws, ticketId) =>
      this.ticketIn(ws, ticketId)
        ? this.s.activities
            .filter((a) => a.ticketId === ticketId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : [],
    addActivity: async (ws, data) => {
      if (!this.ticketIn(ws, data.ticketId)) throw new Error("Ticket not found");
      const a: TicketActivity = { id: randomUUID(), createdAt: new Date().toISOString(), ...data };
      this.s.activities.push(a);
      this.persist();
      return a;
    },
    metrics: async (ws, since) => {
      const s = since.toISOString();
      return this.s.tickets
        .filter(
          (t) =>
            t.workspaceId === ws &&
            (t.createdAt >= s ||
              ACTIVE_STATUSES.includes(t.status) ||
              (t.resolvedAt !== null && t.resolvedAt >= s)),
        )
        .map((t) => ({
          id: t.id,
          status: t.status,
          priority: t.priority,
          category: t.category,
          channel: t.channel,
          assigneeId: t.assigneeId,
          customerId: t.customerId,
          sentiment: t.ai?.sentiment ?? null,
          createdAt: t.createdAt,
          firstResponseAt: t.firstResponseAt,
          resolvedAt: t.resolvedAt,
        }));
    },
  };
}
