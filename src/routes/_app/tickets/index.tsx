import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
  Loader2,
  Plus,
  Search,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  ACTIVE_STATUSES,
  DONE_STATUSES,
  TICKET_CATEGORIES,
  TICKET_CHANNELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from "@shared/domain";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PriorityBadge, SlaBadge, StatusBadge } from "@/components/common/badges";
import { EmptyState, PageHeader, QueryError, UserAvatar } from "@/components/common/misc";
import { FilterMenu } from "@/components/tickets/FilterMenu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { shortDate, timeAgo } from "@/lib/format";
import { ticketsQuery, useBulkTickets, usersQuery, type TicketFilters } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounce";
import { useTitle } from "@/lib/use-title";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  limit: z.number().int().min(10).max(100).optional().catch(undefined),
  search: z.string().optional().catch(undefined),
  status: z.array(z.enum(TICKET_STATUSES)).optional().catch(undefined),
  priority: z.array(z.enum(TICKET_PRIORITIES)).optional().catch(undefined),
  category: z.array(z.enum(TICKET_CATEGORIES)).optional().catch(undefined),
  channel: z.array(z.enum(TICKET_CHANNELS)).optional().catch(undefined),
  assignee: z.string().optional().catch(undefined),
  sla: z.enum(["breached", "at_risk"]).optional().catch(undefined),
  sort: z.enum(["createdAt", "updatedAt", "priority", "status", "number"]).optional().catch(undefined),
  order: z.enum(["asc", "desc"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_app/tickets/")({
  validateSearch: searchSchema,
  component: TicketsPage,
});

const SORTS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "priority:desc", label: "Highest priority" },
  { value: "status:asc", label: "Status" },
] as const;

const sameSet = (a?: readonly string[], b?: readonly string[]) =>
  (a?.length ?? 0) === (b?.length ?? 0) && (a ?? []).every((x) => b?.includes(x));

function TicketsPage() {
  useTitle("Tickets");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { user } = useMe();
  const users = useQuery(usersQuery);
  const [term, setTerm] = useState(search.search ?? "");
  const debounced = useDebounced(term, 300);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const bulk = useBulkTickets();

  const filters: TicketFilters = { ...search, page: search.page ?? 1, limit: search.limit ?? 20 };
  const { data, isLoading, isFetching, error, refetch } = useQuery(ticketsQuery(filters));

  type Search = z.infer<typeof searchSchema>;
  const update = (patch: Partial<Search>) =>
    navigate({ search: (prev: Search) => ({ ...prev, page: undefined, ...patch }), replace: true });

  useEffect(() => {
    if ((debounced || undefined) !== search.search) update({ search: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => setTerm(search.search ?? ""), [search.search]);
  useEffect(() => setSelected(new Set()), [JSON.stringify(search)]);

  const view = sameSet(search.status, ACTIVE_STATUSES)
    ? "active"
    : sameSet(search.status, DONE_STATUSES)
      ? "done"
      : !search.status
        ? "all"
        : "custom";

  const hasFilters = !!(
    search.search ||
    search.status ||
    search.priority ||
    search.category ||
    search.channel ||
    search.assignee ||
    search.sla
  );

  const rows = data?.data ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  async function runBulk(action: "update" | "delete", patch?: Parameters<typeof bulk.mutate>[0]["patch"]) {
    try {
      const r = await bulk.mutateAsync({ ids: [...selected], action, patch });
      toast.success(`${r.affected} ticket${r.affected === 1 ? "" : "s"} ${action === "delete" ? "deleted" : "updated"}`);
      setSelected(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const { page: _p, limit: _l, ...rest } = filters;
      const blob = await api.blob("/tickets/export", { ...rest });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `supportflow-tickets-${new Date().toISOString().slice(0, 10)}.csv`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const assigneeLabel = useMemo(() => {
    if (!search.assignee) return "Anyone";
    if (search.assignee === "me") return "Me";
    if (search.assignee === "unassigned") return "Unassigned";
    return users.data?.find((u) => u.id === search.assignee)?.name ?? "Agent";
  }, [search.assignee, users.data]);

  const meta = data?.meta;
  const from = meta && meta.total ? (meta.page - 1) * meta.limit + 1 : 0;
  const to = meta ? Math.min(meta.total, meta.page * meta.limit) : 0;

  return (
    <>
      <PageHeader
        title="Tickets"
        description={meta ? `${meta.total} ticket${meta.total === 1 ? "" : "s"} match the current view` : "Every customer request in one queue"}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={exporting || !meta?.total}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export CSV
            </Button>
            <Button asChild>
              <Link to="/tickets/new">
                <Plus /> New ticket
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-1 border-b">
        {(
          [
            ["active", "Active", ACTIVE_STATUSES],
            ["all", "All tickets", undefined],
            ["done", "Resolved & closed", DONE_STATUSES],
          ] as const
        ).map(([key, label, statuses]) => (
          <button
            key={key}
            onClick={() => update({ status: statuses ? [...statuses] : undefined })}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              view === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search ID, subject, customer…"
            className="h-9 pl-8 pr-8"
          />
          {term && (
            <button onClick={() => setTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <FilterMenu label="Status" options={TICKET_STATUSES} value={search.status} onChange={(v) => update({ status: v })} render={(s) => <StatusBadge status={s as TicketStatus} />} />
        <FilterMenu label="Priority" options={TICKET_PRIORITIES} value={search.priority} onChange={(v) => update({ priority: v })} render={(p) => <PriorityBadge priority={p as TicketPriority} />} />
        <FilterMenu label="Category" options={TICKET_CATEGORIES} value={search.category} onChange={(v) => update({ category: v })} />
        <FilterMenu label="Channel" options={TICKET_CHANNELS} value={search.channel} onChange={(v) => update({ channel: v })} />
        <Select value={search.assignee ?? "any"} onValueChange={(v) => update({ assignee: v === "any" ? undefined : v })}>
          <SelectTrigger className={cn("h-9 w-auto gap-2", search.assignee && "border-primary/40 bg-primary/5")}>
            <span className="text-muted-foreground">Assignee:</span> <SelectValue>{assigneeLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Anyone</SelectItem>
            <SelectItem value="me">Me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {users.data?.filter((u) => u.id !== user.id).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={search.sla ?? "any"} onValueChange={(v) => update({ sla: v === "any" ? undefined : (v as "breached" | "at_risk") })}>
          <SelectTrigger className={cn("h-9 w-auto gap-2", search.sla && "border-primary/40 bg-primary/5")}>
            <span className="text-muted-foreground">SLA:</span> <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            <SelectItem value="at_risk">At risk</SelectItem>
            <SelectItem value="breached">Breached</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => navigate({ search: {}, replace: true })}>
            <X /> Reset
          </Button>
        )}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9">
                <ArrowDownUp /> {SORTS.find((s) => s.value === `${search.sort ?? "createdAt"}:${search.order ?? "desc"}`)?.label ?? "Sort"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={`${search.sort ?? "createdAt"}:${search.order ?? "desc"}`}
                onValueChange={(v) => {
                  const [sort, order] = v.split(":") as [Search["sort"], Search["order"]];
                  update({ sort, order });
                }}
              >
                {SORTS.map((s) => (
                  <DropdownMenuRadioItem key={s.value} value={s.value}>
                    {s.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2 shadow-[var(--shadow-elevated)]">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="mx-1 h-5 w-px bg-border" />
          <BulkMenu label="Set status" options={TICKET_STATUSES} onPick={(status) => runBulk("update", { status })} />
          <BulkMenu label="Set priority" options={TICKET_PRIORITIES} onPick={(priority) => runBulk("update", { priority })} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">Assign</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => runBulk("update", { assigneeId: null })}>Unassigned</DropdownMenuItem>
              <DropdownMenuSeparator />
              {users.data?.map((u) => (
                <DropdownMenuItem key={u.id} onClick={() => runBulk("update", { assigneeId: u.id })}>
                  {u.name}
                  {u.id === user.id && " (me)"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {user.role === "admin" && (
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          )}
          {bulk.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {error ? (
        <QueryError error={error} onRetry={refetch} />
      ) : (
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon={SearchX}
                title="No tickets match these filters"
                description="Try a different search or clear the filters."
                action={<Button variant="outline" onClick={() => navigate({ search: {}, replace: true })}>Clear filters</Button>}
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title="No tickets yet"
                description="Create your first ticket — AI will triage it and draft a reply."
                action={
                  <Button asChild>
                    <Link to="/tickets/new">
                      <Plus /> Create ticket
                    </Link>
                  </Button>
                }
              />
            )
          ) : (
            <div className={cn("transition-opacity", isFetching && "opacity-70")}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-10 pl-4">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                    </TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead className="hidden md:table-cell">Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Priority</TableHead>
                    <TableHead className="hidden xl:table-cell">Category</TableHead>
                    <TableHead className="hidden lg:table-cell">Assignee</TableHead>
                    <TableHead className="hidden lg:table-cell">SLA</TableHead>
                    <TableHead className="hidden pr-4 text-right md:table-cell">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow
                      key={t.id}
                      data-state={selected.has(t.id) ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => navigate({ to: "/tickets/$ticketId", params: { ticketId: t.key } })}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} aria-label={`Select ${t.key}`} />
                      </TableCell>
                      <TableCell className="max-w-0 min-w-[220px] py-3">
                        <Link
                          to="/tickets/$ticketId"
                          params={{ ticketId: t.key }}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate font-medium hover:underline"
                        >
                          {t.subject}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          <span className="font-mono">{t.key}</span> · {t.customer.name}
                          {t.customer.company ? ` · ${t.customer.company}` : ""} · {timeAgo(t.createdAt)}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 md:hidden">
                          <StatusBadge status={t.status} />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <PriorityBadge priority={t.priority} />
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">{t.category}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {t.assignee ? (
                          <span className="flex items-center gap-2 text-sm">
                            <UserAvatar name={t.assignee.name} className="size-6" />
                            <span className="truncate">{t.assignee.id === user.id ? "You" : t.assignee.name}</span>
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <SlaBadge sla={t.sla} compact />
                      </TableCell>
                      <TableCell className="hidden pr-4 text-right text-xs text-muted-foreground md:table-cell" title={shortDate(t.updatedAt)}>
                        {timeAgo(t.updatedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {meta && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                  <span className="text-muted-foreground">
                    Showing <span className="tabular font-medium text-foreground">{from}–{to}</span> of{" "}
                    <span className="tabular font-medium text-foreground">{meta.total}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <Select value={String(meta.limit)} onValueChange={(v) => update({ limit: Number(v) })}>
                      <SelectTrigger className="h-8 w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[10, 20, 50, 100].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} / page
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      disabled={meta.page <= 1}
                      onClick={() => navigate({ search: (p: Search) => ({ ...p, page: meta.page - 1 }) })}
                      aria-label="Previous page"
                    >
                      <ChevronLeft />
                    </Button>
                    <span className="tabular text-muted-foreground">
                      {meta.page} / {meta.pageCount}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      disabled={meta.page >= meta.pageCount}
                      onClick={() => navigate({ search: (p: Search) => ({ ...p, page: meta.page + 1 }) })}
                      aria-label="Next page"
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${selected.size} ticket${selected.size === 1 ? "" : "s"}?`}
        description="This permanently removes the tickets with their notes and history. This can't be undone."
        onConfirm={() => runBulk("delete")}
      />
    </>
  );
}

function BulkMenu<T extends string>({ label, options, onPick }: { label: string; options: readonly T[]; onPick: (v: T) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {options.map((o) => (
          <DropdownMenuItem key={o} onClick={() => onPick(o)}>
            {o}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
