import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AIAnalysis,
  Customer,
  CustomerWithStats,
  Paginated,
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
} from "@shared/domain";
import { api } from "./api";
import { tzOffset } from "./format";

// ─── Types returned by aggregate endpoints ──────────────────────────────────

export interface Me {
  user: User;
  workspace: Workspace;
}
export interface Health {
  status: "ok" | "degraded";
  version: string;
  database: { kind: "postgres" | "memory"; ok: boolean; error?: string };
  ai: { provider: "gemini" | "heuristic"; model: string | null };
  signupEnabled: boolean;
  warnings: string[];
}
export interface NameValue<T extends string = string> {
  name: T;
  value: number;
}
export interface VolumePoint {
  date: string;
  created: number;
  resolved: number;
}
export interface Dashboard {
  counts: {
    active: number;
    open: number;
    inProgress: number;
    pending: number;
    unassigned: number;
    mine: number;
    urgent: number;
    breached: number;
    atRisk: number;
    created24h: number;
    resolved24h: number;
    totalTickets: number;
    totalCustomers: number;
  };
  byStatus: NameValue<TicketStatus>[];
  bySentiment: NameValue[];
  volume: VolumePoint[];
  recent: TicketListItem[];
  needsAttention: TicketListItem[];
}
interface Kpi {
  value: number | null;
  change: number | null;
}
export interface Analytics {
  range: { days: number; from: string; to: string };
  kpis: {
    created: Kpi;
    resolved: Kpi;
    backlog: Kpi;
    avgFirstResponseHours: Kpi;
    avgResolutionHours: Kpi;
    slaCompliance: Kpi;
  };
  volume: VolumePoint[];
  byStatus: NameValue<TicketStatus>[];
  byCategory: NameValue<TicketCategory>[];
  byPriority: NameValue<TicketPriority>[];
  byChannel: NameValue<TicketChannel>[];
  bySentiment: NameValue[];
  resolutionByPriority: { name: TicketPriority; hours: number | null; count: number }[];
  agents: {
    id: string;
    name: string;
    role: UserRole;
    assigned: number;
    active: number;
    resolved: number;
    avgResolutionHours: number | null;
    slaCompliance: number | null;
  }[];
  topCustomers: { id: string; name: string; company: string | null; count: number }[];
}

export interface TicketFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: TicketStatus[];
  priority?: TicketPriority[];
  category?: TicketCategory[];
  channel?: TicketChannel[];
  assignee?: string;
  customerId?: string;
  sla?: "breached" | "at_risk";
  sort?: "createdAt" | "updatedAt" | "priority" | "status" | "number";
  order?: "asc" | "desc";
}

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  health?: string;
  sort?: "name" | "createdAt" | "tickets" | "lastTicketAt";
  order?: "asc" | "desc";
}

export interface TicketDetail {
  ticket: TicketListItem;
  notes: TicketNote[];
  activities: TicketActivity[];
}

// ─── Query options ──────────────────────────────────────────────────────────

export const qk = {
  me: ["me"] as const,
  health: ["health"] as const,
  users: ["users"] as const,
  dashboard: ["dashboard"] as const,
  analytics: (days: number) => ["analytics", days] as const,
  tickets: (f: TicketFilters) => ["tickets", f] as const,
  ticket: (id: string) => ["ticket", id] as const,
  customers: (f: CustomerFilters) => ["customers", f] as const,
  customer: (id: string) => ["customer", id] as const,
};

export const meQuery = queryOptions({
  queryKey: qk.me,
  queryFn: () => api.get<Me>("/auth/me"),
  staleTime: 5 * 60_000,
});
export const healthQuery = queryOptions({
  queryKey: qk.health,
  queryFn: () => api.get<Health>("/health"),
  staleTime: 5 * 60_000,
});
export const usersQuery = queryOptions({
  queryKey: qk.users,
  queryFn: () => api.get<User[]>("/users"),
  staleTime: 60_000,
});
export const dashboardQuery = queryOptions({
  queryKey: qk.dashboard,
  queryFn: () => api.get<Dashboard>("/dashboard", { tzOffset: tzOffset() }),
  refetchInterval: 60_000,
});
export const analyticsQuery = (days: number) =>
  queryOptions({
    queryKey: qk.analytics(days),
    queryFn: () => api.get<Analytics>("/analytics", { days, tzOffset: tzOffset() }),
    placeholderData: keepPreviousData,
  });
export const ticketsQuery = (f: TicketFilters) =>
  queryOptions({
    queryKey: qk.tickets(f),
    queryFn: () => api.page<Paginated<TicketListItem>>("/tickets", { ...f }),
    placeholderData: keepPreviousData,
  });
export const ticketQuery = (id: string) =>
  queryOptions({
    queryKey: qk.ticket(id),
    queryFn: () => api.get<TicketDetail>(`/tickets/${encodeURIComponent(id)}`),
  });
export const customersQuery = (f: CustomerFilters) =>
  queryOptions({
    queryKey: qk.customers(f),
    queryFn: () => api.page<Paginated<CustomerWithStats>>("/customers", { ...f }),
    placeholderData: keepPreviousData,
  });
export const customerQuery = (id: string) =>
  queryOptions({
    queryKey: qk.customer(id),
    queryFn: () => api.get<CustomerWithStats>(`/customers/${id}`),
  });

// ─── Mutations ──────────────────────────────────────────────────────────────

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  customerId?: string;
  customer?: { name: string; email: string; company?: string | null; phone?: string | null };
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  channel?: TicketChannel;
  assigneeId?: string | null;
}

export function useCreateTicket() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => api.post<TicketListItem>("/tickets", input),
    onSuccess: () => inv("tickets", "dashboard", "analytics", "customers", "customer"),
  });
}

export type TicketUpdate = Partial<
  Pick<Ticket, "status" | "priority" | "category" | "channel" | "assigneeId" | "subject" | "description">
>;

export function useUpdateTicket(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (patch: TicketUpdate) => api.patch<TicketListItem>(`/tickets/${id}`, patch),
    onSuccess: () => inv("ticket", "tickets", "dashboard", "analytics", "customer", "customers"),
  });
}

export function useBulkTickets() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: { ids: string[]; action: "update" | "delete"; patch?: TicketUpdate }) =>
      api.post<{ affected: number }>("/tickets/bulk", input),
    onSuccess: () => inv("ticket", "tickets", "dashboard", "analytics", "customer", "customers"),
  });
}

export function useDeleteTicket() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tickets/${id}`),
    onSuccess: () => inv("tickets", "dashboard", "analytics", "customers", "customer"),
  });
}

export function useAddNote(ticketId: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: { body: string; internal: boolean }) => api.post<TicketNote>(`/tickets/${ticketId}/notes`, input),
    onSuccess: () => inv("ticket", "tickets", "dashboard", "analytics"),
  });
}

export function useReanalyze(ticketId: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: () => api.post<TicketListItem>(`/tickets/${ticketId}/analyze`),
    onSuccess: () => inv("ticket", "tickets", "dashboard"),
  });
}

export function useAnalyzePreview() {
  return useMutation({
    mutationFn: (input: { subject: string; description: string; customerId?: string }) =>
      api.post<AIAnalysis>("/ai/analyze", input),
  });
}

export interface CustomerInput {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  health?: Customer["health"];
  notes?: string | null;
}

export function useSaveCustomer(id?: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: CustomerInput) =>
      id ? api.patch<Customer>(`/customers/${id}`, input) : api.post<Customer>("/customers", input),
    onSuccess: () => inv("customers", "customer", "tickets", "ticket", "dashboard"),
  });
}

export function useDeleteCustomer() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => inv("customers", "tickets", "dashboard", "analytics"),
  });
}

export function useCreateUser() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string; role: UserRole }) =>
      api.post<User>("/users", input),
    onSuccess: () => inv("users", "analytics"),
  });
}

export function useUpdateUser() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; role?: UserRole }) =>
      api.patch<User>(`/users/${id}`, patch),
    onSuccess: () => inv("users", "me"),
  });
}

export function useDeleteUser() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => inv("users", "tickets", "ticket", "analytics"),
  });
}

export function useUpdateMe() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: { name?: string; currentPassword?: string; newPassword?: string }) =>
      api.patch<User>("/auth/me", input),
    onSuccess: () => inv("me", "users"),
  });
}

export function useRenameWorkspace() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => api.patch<Workspace>("/workspace", { name }),
    onSuccess: () => inv("me"),
  });
}
