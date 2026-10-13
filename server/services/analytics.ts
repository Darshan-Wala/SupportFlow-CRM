import {
  ACTIVE_STATUSES,
  SENTIMENTS,
  TICKET_CATEGORIES,
  TICKET_CHANNELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  computeSla,
  type TicketListItem,
  type User,
} from "../../shared/domain.js";
import type { Store, TicketMetricRow } from "../db/types.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** yyyy-mm-dd in the viewer's local time (tzOffset = Date#getTimezoneOffset() in minutes). */
const localDay = (ms: number, tzOffset: number) => new Date(ms - tzOffset * 60_000).toISOString().slice(0, 10);

function dayBuckets(days: number, tzOffset: number, now: number) {
  return Array.from({ length: days }, (_, i) => localDay(now - (days - 1 - i) * DAY, tzOffset));
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
const ms = (s: string) => new Date(s).getTime();

function countBy<T extends string>(rows: TicketMetricRow[], key: (r: TicketMetricRow) => T | null, keys: readonly T[]) {
  const m = new Map<T, number>(keys.map((k) => [k, 0]));
  for (const r of rows) {
    const k = key(r);
    if (k && m.has(k)) m.set(k, m.get(k)! + 1);
  }
  return keys.map((k) => ({ name: k, value: m.get(k)! }));
}

function volumeSeries(rows: TicketMetricRow[], days: number, tzOffset: number, now: number) {
  const buckets = dayBuckets(days, tzOffset, now);
  const idx = new Map(buckets.map((d, i) => [d, i]));
  const out = buckets.map((date) => ({ date, created: 0, resolved: 0 }));
  for (const r of rows) {
    const c = idx.get(localDay(ms(r.createdAt), tzOffset));
    if (c !== undefined) out[c]!.created++;
    if (r.resolvedAt) {
      const d = idx.get(localDay(ms(r.resolvedAt), tzOffset));
      if (d !== undefined) out[d]!.resolved++;
    }
  }
  return out;
}

const SLA_RANK = { breached: 0, at_risk: 1, ok: 2, met: 3 } as const;
const PRI_RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 } as const;

export async function buildDashboard(store: Store, user: User, tzOffset: number) {
  const ws = user.workspaceId;
  const now = Date.now();
  const [rows, recent, activeList, customers] = await Promise.all([
    store.tickets.metrics(ws, new Date(now - 14 * DAY)),
    store.tickets.list(ws, { page: 1, limit: 6, sort: "createdAt", order: "desc" }),
    store.tickets.list(ws, { page: 1, limit: 100, status: ACTIVE_STATUSES, sort: "priority", order: "desc" }),
    store.customers.list(ws, { page: 1, limit: 1, sort: "createdAt", order: "desc" }),
  ]);

  const active = rows.filter((r) => ACTIVE_STATUSES.includes(r.status));
  const slaOf = (r: TicketMetricRow) => computeSla(r, now).state;
  const needsAttention: TicketListItem[] = activeList.data
    .filter((t) => t.sla.state === "breached" || t.sla.state === "at_risk" || t.priority === "Urgent" || t.priority === "High")
    .sort(
      (a, b) =>
        SLA_RANK[a.sla.state] - SLA_RANK[b.sla.state] ||
        PRI_RANK[a.priority] - PRI_RANK[b.priority] ||
        a.sla.dueAt.localeCompare(b.sla.dueAt),
    )
    .slice(0, 6);

  return {
    counts: {
      active: active.length,
      open: active.filter((r) => r.status === "Open").length,
      inProgress: active.filter((r) => r.status === "In Progress").length,
      pending: active.filter((r) => r.status === "Pending").length,
      unassigned: active.filter((r) => !r.assigneeId).length,
      mine: active.filter((r) => r.assigneeId === user.id).length,
      urgent: active.filter((r) => r.priority === "Urgent").length,
      breached: active.filter((r) => slaOf(r) === "breached").length,
      atRisk: active.filter((r) => slaOf(r) === "at_risk").length,
      created24h: rows.filter((r) => ms(r.createdAt) >= now - DAY).length,
      resolved24h: rows.filter((r) => r.resolvedAt && ms(r.resolvedAt) >= now - DAY).length,
      totalTickets: recent.meta.total,
      totalCustomers: customers.meta.total,
    },
    byStatus: countBy(active, (r) => r.status, ACTIVE_STATUSES),
    bySentiment: countBy(active, (r) => r.sentiment, SENTIMENTS),
    volume: volumeSeries(rows, 14, tzOffset, now),
    recent: recent.data,
    needsAttention,
  };
}

export async function buildAnalytics(store: Store, ws: string, days: number, tzOffset: number) {
  const now = Date.now();
  const start = now - days * DAY;
  const prevStart = now - 2 * days * DAY;
  const [rows, users] = await Promise.all([store.tickets.metrics(ws, new Date(prevStart)), store.users.list(ws)]);

  const inRange = (iso: string | null, from: number, to: number) => !!iso && ms(iso) >= from && ms(iso) < to;
  const created = rows.filter((r) => inRange(r.createdAt, start, now + 1));
  const createdPrev = rows.filter((r) => inRange(r.createdAt, prevStart, start));
  const resolved = rows.filter((r) => inRange(r.resolvedAt, start, now + 1));
  const resolvedPrev = rows.filter((r) => inRange(r.resolvedAt, prevStart, start));

  const frt = (rs: TicketMetricRow[]) =>
    round1(avg(rs.filter((r) => r.firstResponseAt).map((r) => (ms(r.firstResponseAt!) - ms(r.createdAt)) / HOUR)));
  const art = (rs: TicketMetricRow[]) => round1(avg(rs.map((r) => (ms(r.resolvedAt!) - ms(r.createdAt)) / HOUR)));
  const sla = (rs: TicketMetricRow[]) =>
    rs.length ? Math.round((rs.filter((r) => computeSla(r, now).state === "met").length / rs.length) * 1000) / 10 : null;

  const change = (cur: number | null, prev: number | null) =>
    cur == null || prev == null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10;

  const kpis = {
    created: { value: created.length, change: change(created.length, createdPrev.length) },
    resolved: { value: resolved.length, change: change(resolved.length, resolvedPrev.length) },
    backlog: { value: rows.filter((r) => ACTIVE_STATUSES.includes(r.status)).length, change: null },
    avgFirstResponseHours: { value: frt(created), change: change(frt(created), frt(createdPrev)) },
    avgResolutionHours: { value: art(resolved), change: change(art(resolved), art(resolvedPrev)) },
    slaCompliance: { value: sla(resolved), change: change(sla(resolved), sla(resolvedPrev)) },
  };

  const resolutionByPriority = TICKET_PRIORITIES.map((p) => ({
    name: p,
    hours: art(resolved.filter((r) => r.priority === p)),
    count: resolved.filter((r) => r.priority === p).length,
  }));

  const agents = users
    .map((u) => {
      const mineResolved = resolved.filter((r) => r.assigneeId === u.id);
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        assigned: created.filter((r) => r.assigneeId === u.id).length,
        active: rows.filter((r) => r.assigneeId === u.id && ACTIVE_STATUSES.includes(r.status)).length,
        resolved: mineResolved.length,
        avgResolutionHours: art(mineResolved),
        slaCompliance: sla(mineResolved),
      };
    })
    .sort((a, b) => b.resolved - a.resolved || b.active - a.active);

  const customerCounts = new Map<string, number>();
  created.forEach((r) => customerCounts.set(r.customerId, (customerCounts.get(r.customerId) ?? 0) + 1));
  const topIds = [...customerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topCustomers = (
    await Promise.all(
      topIds.map(async ([id, count]) => {
        const c = await store.customers.get(ws, id);
        return c ? { id, name: c.name, company: c.company, count } : null;
      }),
    )
  ).filter(Boolean);

  return {
    range: { days, from: new Date(start).toISOString(), to: new Date(now).toISOString() },
    kpis,
    volume: volumeSeries(rows, days, tzOffset, now),
    byStatus: countBy(created, (r) => r.status, TICKET_STATUSES),
    byCategory: countBy(created, (r) => r.category, TICKET_CATEGORIES),
    byPriority: countBy(created, (r) => r.priority, TICKET_PRIORITIES),
    byChannel: countBy(created, (r) => r.channel, TICKET_CHANNELS),
    bySentiment: countBy(created, (r) => r.sentiment, SENTIMENTS),
    resolutionByPriority,
    agents,
    topCustomers,
  };
}
