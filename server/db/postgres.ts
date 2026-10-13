import pg from "pg";
import {
  ACTIVE_STATUSES,
  DONE_STATUSES,
  SLA_HOURS,
  TICKET_STATUSES,
  computeSla,
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
import { SCHEMA_SQL } from "./schema.sql.js";
import type { Store, TicketMetricRow, TicketPatch, UserRecord } from "./types.js";

type Row = Record<string, any>;

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));

const mapWorkspace = (r: Row): Workspace => ({ id: r.id, name: r.name, createdAt: iso(r.created_at) });

const mapUser = (r: Row): UserRecord => ({
  id: r.id,
  workspaceId: r.workspace_id,
  email: r.email,
  name: r.name,
  role: r.role,
  passwordHash: r.password_hash,
  createdAt: iso(r.created_at),
});
const publicUser = (r: Row): User => {
  const { passwordHash: _p, ...u } = mapUser(r);
  return u;
};

const mapCustomer = (r: Row): Customer => ({
  id: r.id,
  workspaceId: r.workspace_id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  company: r.company,
  health: r.health,
  notes: r.notes,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

const mapCustomerStats = (r: Row): CustomerWithStats => ({
  ...mapCustomer(r),
  ticketCount: Number(r.ticket_count ?? 0),
  openTicketCount: Number(r.open_ticket_count ?? 0),
  lastTicketAt: isoOrNull(r.last_ticket_at),
});

const mapTicket = (r: Row): Ticket => ({
  id: r.id,
  workspaceId: r.workspace_id,
  number: r.number,
  key: ticketKey(r.number),
  subject: r.subject,
  description: r.description,
  status: r.status,
  priority: r.priority,
  category: r.category,
  channel: r.channel,
  customerId: r.customer_id,
  assigneeId: r.assignee_id,
  ai: r.ai ?? null,
  firstResponseAt: isoOrNull(r.first_response_at),
  resolvedAt: isoOrNull(r.resolved_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

const mapTicketItem = (r: Row): TicketListItem => {
  const t = mapTicket(r);
  return {
    ...t,
    customer: { id: t.customerId, name: r.c_name, email: r.c_email, company: r.c_company, health: r.c_health },
    assignee: t.assigneeId ? { id: t.assigneeId, name: r.a_name, email: r.a_email } : null,
    sla: computeSla(t),
  };
};

const mapNote = (r: Row): TicketNote => ({
  id: r.id,
  ticketId: r.ticket_id,
  authorId: r.author_id,
  authorName: r.author_name,
  body: r.body,
  internal: r.internal,
  createdAt: iso(r.created_at),
});

const mapActivity = (r: Row): TicketActivity => ({
  id: r.id,
  ticketId: r.ticket_id,
  actorName: r.actor_name,
  type: r.type,
  message: r.message,
  createdAt: iso(r.created_at),
});

const TICKET_SELECT = `
  SELECT t.*, c.name AS c_name, c.email AS c_email, c.company AS c_company, c.health AS c_health,
         u.name AS a_name, u.email AS a_email
  FROM sf_tickets t
  JOIN sf_customers c ON c.id = t.customer_id
  LEFT JOIN sf_users u ON u.id = t.assignee_id`;

const SLA_HOURS_SQL = `(CASE t.priority ${Object.entries(SLA_HOURS)
  .map(([p, h]) => `WHEN '${p}' THEN ${h}`)
  .join(" ")} END)`;
const SLA_DUE_SQL = `(t.created_at + ${SLA_HOURS_SQL} * interval '1 hour')`;
const DONE_SQL = `t.status IN (${DONE_STATUSES.map((s) => `'${s}'`).join(",")})`;
const ACTIVE_SQL = `t.status IN (${ACTIVE_STATUSES.map((s) => `'${s}'`).join(",")})`;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

const PATCH_COLUMNS: Record<keyof TicketPatch, string> = {
  subject: "subject",
  description: "description",
  status: "status",
  priority: "priority",
  category: "category",
  channel: "channel",
  assigneeId: "assignee_id",
  ai: "ai",
  firstResponseAt: "first_response_at",
  resolvedAt: "resolved_at",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PostgresStore implements Store {
  readonly kind = "postgres" as const;
  private pool: pg.Pool;
  private ready: Promise<void> | null = null;

  constructor(connectionString: string, opts: { serverless: boolean }) {
    const url = new URL(connectionString);
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.hostname.endsWith(".local");
    const sslInUrl = url.searchParams.has("sslmode") || url.searchParams.has("ssl");
    this.pool = new pg.Pool({
      connectionString,
      ssl: !local && !sslInUrl ? { rejectUnauthorized: false } : undefined,
      max: opts.serverless ? 3 : 10,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    this.pool.on("error", (err) => console.error("[db] idle client error", err.message));
  }

  private q<T extends Row = Row>(text: string, params: unknown[] = []) {
    return this.pool.query<T>(text, params);
  }

  /** Creates tables on first use. Guarded by an advisory lock so parallel cold starts are safe. */
  init() {
    if (!this.ready) {
      this.ready = (async () => {
        const { rows } = await this.q(`SELECT to_regclass('public.sf_ticket_activities') AS t`);
        if (rows[0]?.t) return;
        const client = await this.pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock(727274001)");
          await client.query(SCHEMA_SQL);
          await client.query("COMMIT");
          console.log("[db] Postgres schema ready");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      })().catch((err) => {
        this.ready = null;
        throw err;
      });
    }
    return this.ready;
  }

  async end() {
    await this.pool.end();
  }

  workspaces: Store["workspaces"] = {
    create: async (name) =>
      mapWorkspace((await this.q(`INSERT INTO sf_workspaces (name) VALUES ($1) RETURNING *`, [name])).rows[0]!),
    get: async (id) => {
      if (!UUID_RE.test(id)) return null;
      const r = (await this.q(`SELECT * FROM sf_workspaces WHERE id = $1`, [id])).rows[0];
      return r ? mapWorkspace(r) : null;
    },
    rename: async (id, name) => {
      const r = (await this.q(`UPDATE sf_workspaces SET name = $2 WHERE id = $1 RETURNING *`, [id, name])).rows[0];
      return r ? mapWorkspace(r) : null;
    },
  };

  users: Store["users"] = {
    findByEmail: async (email) => {
      const r = (await this.q(`SELECT * FROM sf_users WHERE lower(email) = lower($1)`, [email])).rows[0];
      return r ? mapUser(r) : null;
    },
    findById: async (id) => {
      if (!UUID_RE.test(id)) return null;
      const r = (await this.q(`SELECT * FROM sf_users WHERE id = $1`, [id])).rows[0];
      return r ? mapUser(r) : null;
    },
    list: async (ws) =>
      (await this.q(`SELECT * FROM sf_users WHERE workspace_id = $1 ORDER BY name`, [ws])).rows.map(publicUser),
    create: async (d) =>
      publicUser(
        (
          await this.q(
            `INSERT INTO sf_users (workspace_id, email, name, role, password_hash)
             VALUES ($1, lower($2), $3, $4, $5) RETURNING *`,
            [d.workspaceId, d.email, d.name, d.role, d.passwordHash],
          )
        ).rows[0]!,
      ),
    update: async (ws, id, patch) => {
      if (!UUID_RE.test(id)) return null;
      const r = (
        await this.q(
          `UPDATE sf_users SET name = COALESCE($3, name), role = COALESCE($4, role),
             password_hash = COALESCE($5, password_hash)
           WHERE id = $1 AND workspace_id = $2 RETURNING *`,
          [id, ws, patch.name ?? null, patch.role ?? null, patch.passwordHash ?? null],
        )
      ).rows[0];
      return r ? publicUser(r) : null;
    },
    delete: async (ws, id) => {
      if (!UUID_RE.test(id)) return false;
      const r = await this.q(`DELETE FROM sf_users WHERE id = $1 AND workspace_id = $2`, [id, ws]);
      return (r.rowCount ?? 0) > 0;
    },
  };

  private customerStatsSelect = `
    SELECT c.*,
      (SELECT count(*) FROM sf_tickets t WHERE t.customer_id = c.id) AS ticket_count,
      (SELECT count(*) FROM sf_tickets t WHERE t.customer_id = c.id AND ${ACTIVE_SQL}) AS open_ticket_count,
      (SELECT max(t.created_at) FROM sf_tickets t WHERE t.customer_id = c.id) AS last_ticket_at
    FROM sf_customers c`;

  customers: Store["customers"] = {
    list: async (ws, q) => {
      const where = ["c.workspace_id = $1"];
      const params: unknown[] = [ws];
      if (q.health) {
        params.push(q.health);
        where.push(`c.health = $${params.length}`);
      }
      if (q.search?.trim()) {
        params.push(`%${escapeLike(q.search.trim())}%`);
        const p = `$${params.length}`;
        where.push(`(c.name ILIKE ${p} OR c.email ILIKE ${p} OR c.company ILIKE ${p} OR c.phone ILIKE ${p})`);
      }
      const sortCol = { name: "c.name", createdAt: "c.created_at", tickets: "ticket_count", lastTicketAt: "last_ticket_at" }[q.sort];
      const dir = q.order === "asc" ? "ASC" : "DESC";
      const whereSql = where.join(" AND ");
      const [rows, count] = await Promise.all([
        this.q(
          `SELECT * FROM (${this.customerStatsSelect} WHERE ${whereSql}) x
           ORDER BY ${sortCol.replace("c.", "x.")} ${dir} NULLS LAST, x.name ASC
           LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
          params,
        ),
        this.q(`SELECT count(*)::int AS n FROM sf_customers c WHERE ${whereSql}`, params),
      ]);
      const total = count.rows[0]!.n as number;
      return {
        data: rows.rows.map(mapCustomerStats),
        meta: { page: q.page, limit: q.limit, total, pageCount: Math.max(1, Math.ceil(total / q.limit)) },
      };
    },
    get: async (ws, id) => {
      if (!UUID_RE.test(id)) return null;
      const r = (await this.q(`${this.customerStatsSelect} WHERE c.id = $1 AND c.workspace_id = $2`, [id, ws])).rows[0];
      return r ? mapCustomerStats(r) : null;
    },
    findByEmail: async (ws, email) => {
      const r = (
        await this.q(`SELECT * FROM sf_customers WHERE workspace_id = $1 AND lower(email) = lower($2)`, [ws, email])
      ).rows[0];
      return r ? mapCustomer(r) : null;
    },
    create: async (ws, d) =>
      mapCustomer(
        (
          await this.q(
            `INSERT INTO sf_customers (workspace_id, name, email, phone, company, health, notes)
             VALUES ($1, $2, lower($3), $4, $5, $6, $7) RETURNING *`,
            [ws, d.name, d.email, d.phone ?? null, d.company ?? null, d.health ?? "Active", d.notes ?? null],
          )
        ).rows[0]!,
      ),
    update: async (ws, id, p) => {
      if (!UUID_RE.test(id)) return null;
      const sets: string[] = [];
      const params: unknown[] = [id, ws];
      for (const [k, col] of [
        ["name", "name"],
        ["email", "email"],
        ["phone", "phone"],
        ["company", "company"],
        ["health", "health"],
        ["notes", "notes"],
      ] as const) {
        if (p[k] !== undefined) {
          params.push(k === "email" ? String(p[k]).toLowerCase() : p[k]);
          sets.push(`${col} = $${params.length}`);
        }
      }
      sets.push("updated_at = now()");
      const r = (
        await this.q(`UPDATE sf_customers SET ${sets.join(", ")} WHERE id = $1 AND workspace_id = $2 RETURNING *`, params)
      ).rows[0];
      return r ? mapCustomer(r) : null;
    },
    delete: async (ws, id) => {
      if (!UUID_RE.test(id)) return false;
      const r = await this.q(`DELETE FROM sf_customers WHERE id = $1 AND workspace_id = $2`, [id, ws]);
      return (r.rowCount ?? 0) > 0;
    },
  };

  tickets: Store["tickets"] = {
    list: async (ws, q) => {
      const where = ["t.workspace_id = $1"];
      const params: unknown[] = [ws];
      const addIn = (col: string, values?: string[]) => {
        if (!values?.length) return;
        params.push(values);
        where.push(`${col} = ANY($${params.length}::text[])`);
      };
      addIn("t.status", q.status);
      addIn("t.priority", q.priority);
      addIn("t.category", q.category);
      addIn("t.channel", q.channel);
      if (q.customerId && UUID_RE.test(q.customerId)) {
        params.push(q.customerId);
        where.push(`t.customer_id = $${params.length}`);
      }
      if (q.assignee === "unassigned") where.push("t.assignee_id IS NULL");
      else if (q.assignee && UUID_RE.test(q.assignee)) {
        params.push(q.assignee);
        where.push(`t.assignee_id = $${params.length}`);
      }
      if (q.sla === "breached") {
        where.push(`((${DONE_SQL} AND t.resolved_at > ${SLA_DUE_SQL}) OR (NOT ${DONE_SQL} AND now() > ${SLA_DUE_SQL}))`);
      } else if (q.sla === "at_risk") {
        where.push(
          `(NOT ${DONE_SQL} AND now() <= ${SLA_DUE_SQL} AND ${SLA_DUE_SQL} - now() < ${SLA_HOURS_SQL} * interval '15 minutes')`,
        );
      }
      if (q.search?.trim()) {
        const term = q.search.trim();
        params.push(`%${escapeLike(term)}%`);
        const p = `$${params.length}`;
        const numeric = term.replace(/^tkt-?/i, "");
        const numClause = /^\d+$/.test(numeric) ? ` OR t.number = ${Number(numeric)}` : "";
        where.push(
          `(t.subject ILIKE ${p} OR t.description ILIKE ${p} OR c.name ILIKE ${p} OR c.email ILIKE ${p}
            OR c.company ILIKE ${p} OR (t.ai->>'tags') ILIKE ${p}${numClause})`,
        );
      }
      const dir = q.order === "asc" ? "ASC" : "DESC";
      const order = {
        createdAt: `t.created_at ${dir}`,
        updatedAt: `t.updated_at ${dir}`,
        number: `t.number ${dir}`,
        priority: `(CASE t.priority WHEN 'Low' THEN 1 WHEN 'Medium' THEN 2 WHEN 'High' THEN 3 ELSE 4 END) ${dir}, t.created_at DESC`,
        status: `array_position(ARRAY[${TICKET_STATUSES.map((s) => `'${s}'`).join(",")}]::text[], t.status) ${dir}, t.created_at DESC`,
      }[q.sort];
      const whereSql = where.join(" AND ");
      const [rows, count] = await Promise.all([
        this.q(`${TICKET_SELECT} WHERE ${whereSql} ORDER BY ${order}, t.number DESC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`, params),
        this.q(`SELECT count(*)::int AS n FROM sf_tickets t JOIN sf_customers c ON c.id = t.customer_id WHERE ${whereSql}`, params),
      ]);
      const total = count.rows[0]!.n as number;
      return {
        data: rows.rows.map(mapTicketItem),
        meta: { page: q.page, limit: q.limit, total, pageCount: Math.max(1, Math.ceil(total / q.limit)) },
      };
    },
    get: async (ws, idOrKey) => {
      let r: Row | undefined;
      if (UUID_RE.test(idOrKey)) {
        r = (await this.q(`${TICKET_SELECT} WHERE t.workspace_id = $1 AND t.id = $2`, [ws, idOrKey])).rows[0];
      } else {
        const n = Number(idOrKey.replace(/^tkt-?/i, ""));
        if (!Number.isInteger(n)) return null;
        r = (await this.q(`${TICKET_SELECT} WHERE t.workspace_id = $1 AND t.number = $2`, [ws, n])).rows[0];
      }
      return r ? mapTicketItem(r) : null;
    },
    create: async (ws, d) => {
      const r = (
        await this.q(
          `WITH n AS (
             UPDATE sf_workspaces SET next_ticket_number = next_ticket_number + 1
             WHERE id = $1 RETURNING next_ticket_number - 1 AS num
           )
           INSERT INTO sf_tickets (workspace_id, number, subject, description, status, priority, category,
                                   channel, customer_id, assignee_id, ai, resolved_at)
           SELECT $1, n.num, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11 FROM n
           RETURNING *`,
          [
            ws,
            d.subject,
            d.description,
            d.status,
            d.priority,
            d.category,
            d.channel,
            d.customerId,
            d.assigneeId,
            d.ai ? JSON.stringify(d.ai) : null,
            DONE_STATUSES.includes(d.status) ? new Date() : null,
          ],
        )
      ).rows[0];
      if (!r) throw new Error("Workspace not found");
      return mapTicket(r);
    },
    update: async (ws, id, patch) => {
      if (!UUID_RE.test(id)) return null;
      const sets: string[] = [];
      const params: unknown[] = [id, ws];
      for (const [k, v] of Object.entries(patch) as [keyof TicketPatch, unknown][]) {
        if (v === undefined || !(k in PATCH_COLUMNS)) continue;
        params.push(k === "ai" && v ? JSON.stringify(v) : v);
        sets.push(`${PATCH_COLUMNS[k]} = $${params.length}`);
      }
      sets.push("updated_at = now()");
      const r = (
        await this.q(`UPDATE sf_tickets SET ${sets.join(", ")} WHERE id = $1 AND workspace_id = $2 RETURNING *`, params)
      ).rows[0];
      return r ? mapTicket(r) : null;
    },
    delete: async (ws, id) => {
      if (!UUID_RE.test(id)) return false;
      const r = await this.q(`DELETE FROM sf_tickets WHERE id = $1 AND workspace_id = $2`, [id, ws]);
      return (r.rowCount ?? 0) > 0;
    },
    notes: async (ws, ticketId) =>
      (
        await this.q(
          `SELECT n.* FROM sf_ticket_notes n JOIN sf_tickets t ON t.id = n.ticket_id
           WHERE n.ticket_id = $1 AND t.workspace_id = $2 ORDER BY n.created_at`,
          [ticketId, ws],
        )
      ).rows.map(mapNote),
    addNote: async (ws, d) => {
      const r = (
        await this.q(
          `INSERT INTO sf_ticket_notes (ticket_id, author_id, author_name, body, internal)
           SELECT t.id, $3, $4, $5, $6 FROM sf_tickets t WHERE t.id = $1 AND t.workspace_id = $2
           RETURNING *`,
          [d.ticketId, ws, d.authorId, d.authorName, d.body, d.internal],
        )
      ).rows[0];
      if (!r) throw new Error("Ticket not found");
      return mapNote(r);
    },
    activities: async (ws, ticketId) =>
      (
        await this.q(
          `SELECT a.* FROM sf_ticket_activities a JOIN sf_tickets t ON t.id = a.ticket_id
           WHERE a.ticket_id = $1 AND t.workspace_id = $2 ORDER BY a.created_at`,
          [ticketId, ws],
        )
      ).rows.map(mapActivity),
    addActivity: async (ws, d) => {
      const r = (
        await this.q(
          `INSERT INTO sf_ticket_activities (ticket_id, actor_name, type, message)
           SELECT t.id, $3, $4, $5 FROM sf_tickets t WHERE t.id = $1 AND t.workspace_id = $2
           RETURNING *`,
          [d.ticketId, ws, d.actorName, d.type, d.message],
        )
      ).rows[0];
      if (!r) throw new Error("Ticket not found");
      return mapActivity(r);
    },
    metrics: async (ws, since) =>
      (
        await this.q(
          `SELECT t.id, t.status, t.priority, t.category, t.channel, t.assignee_id, t.customer_id,
                  t.ai->>'sentiment' AS sentiment, t.created_at, t.first_response_at, t.resolved_at
           FROM sf_tickets t
           WHERE t.workspace_id = $1 AND (t.created_at >= $2 OR ${ACTIVE_SQL} OR t.resolved_at >= $2)`,
          [ws, since],
        )
      ).rows.map(
        (r): TicketMetricRow => ({
          id: r.id,
          status: r.status,
          priority: r.priority,
          category: r.category,
          channel: r.channel,
          assigneeId: r.assignee_id,
          customerId: r.customer_id,
          sentiment: r.sentiment ?? null,
          createdAt: iso(r.created_at),
          firstResponseAt: isoOrNull(r.first_response_at),
          resolvedAt: isoOrNull(r.resolved_at),
        }),
      ),
  };
}
