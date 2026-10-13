import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Search, SearchX, Ticket, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CUSTOMER_HEALTH, type CustomerWithStats } from "@shared/domain";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { HealthBadge } from "@/components/common/badges";
import { EmptyState, PageHeader, QueryError, UserAvatar } from "@/components/common/misc";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/lib/auth";
import { shortDate, timeAgo } from "@/lib/format";
import { customersQuery, useDeleteCustomer } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounce";
import { useTitle } from "@/lib/use-title";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  search: z.string().optional().catch(undefined),
  health: z.enum(CUSTOMER_HEALTH).optional().catch(undefined),
  sort: z.enum(["name", "createdAt", "tickets", "lastTicketAt"]).optional().catch(undefined),
  order: z.enum(["asc", "desc"]).optional().catch(undefined),
  new: z.boolean().optional().catch(undefined),
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_app/customers/")({
  validateSearch: searchSchema,
  component: CustomersPage,
});

const SORTS = {
  "createdAt:desc": "Recently added",
  "name:asc": "Name A–Z",
  "tickets:desc": "Most tickets",
  "lastTicketAt:desc": "Latest activity",
} as const;

function CustomersPage() {
  useTitle("Customers");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { user } = useMe();
  const [term, setTerm] = useState(search.search ?? "");
  const debounced = useDebounced(term);
  const [editing, setEditing] = useState<CustomerWithStats | null>(null);
  const [deleting, setDeleting] = useState<CustomerWithStats | null>(null);
  const del = useDeleteCustomer();

  const update = (patch: Partial<Search>) => navigate({ search: (p: Search) => ({ ...p, page: undefined, ...patch }), replace: true });
  useEffect(() => {
    if ((debounced || undefined) !== search.search) update({ search: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const { new: isNew, ...filters } = search;
  const { data, isLoading, isFetching, error, refetch } = useQuery(customersQuery({ ...filters, page: search.page ?? 1, limit: 20 }));
  const rows = data?.data ?? [];
  const hasFilters = !!(search.search || search.health);
  const sortKey = `${search.sort ?? "createdAt"}:${search.order ?? "desc"}` as keyof typeof SORTS;

  return (
    <>
      <PageHeader
        title="Customers"
        description={data ? `${data.meta.total} customer${data.meta.total === 1 ? "" : "s"} in your workspace` : "People and companies you support"}
        actions={
          <Button onClick={() => update({ new: true })}>
            <Plus /> Add customer
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name, email, company…" className="h-9 pl-8" />
        </div>
        <Select value={search.health ?? "all"} onValueChange={(v) => update({ health: v === "all" ? undefined : (v as Search["health"]) })}>
          <SelectTrigger className={cn("h-9 w-auto gap-2", search.health && "border-primary/40 bg-primary/5")}>
            <span className="text-muted-foreground">Health:</span> <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {CUSTOMER_HEALTH.map((h) => (
              <SelectItem key={h} value={h}>{h}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sortKey}
          onValueChange={(v) => {
            const [sort, order] = v.split(":") as [Search["sort"], Search["order"]];
            update({ sort, order });
          }}
        >
          <SelectTrigger className="h-9 w-auto gap-2">
            <span className="text-muted-foreground">Sort:</span> <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORTS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => { setTerm(""); navigate({ search: {}, replace: true }); }}>
            <X /> Reset
          </Button>
        )}
      </div>

      {error ? (
        <QueryError error={error} onRetry={refetch} />
      ) : (
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            hasFilters ? (
              <EmptyState icon={SearchX} title="No customers match" description="Try a different search or filter." />
            ) : (
              <EmptyState
                icon={Users}
                title="No customers yet"
                description="Add the people you support, or create a ticket and add the customer inline."
                action={
                  <Button onClick={() => update({ new: true })}>
                    <Plus /> Add customer
                  </Button>
                }
              />
            )
          ) : (
            <div className={cn("transition-opacity", isFetching && "opacity-70")}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Customer</TableHead>
                    <TableHead className="hidden md:table-cell">Company</TableHead>
                    <TableHead className="hidden sm:table-cell">Health</TableHead>
                    <TableHead className="text-right">Tickets</TableHead>
                    <TableHead className="hidden lg:table-cell">Last ticket</TableHead>
                    <TableHead className="hidden xl:table-cell">Added</TableHead>
                    <TableHead className="w-10 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate({ to: "/customers/$customerId", params: { customerId: c.id } })}>
                      <TableCell className="max-w-0 min-w-[200px] pl-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={c.name} className="size-8" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-sm md:table-cell">{c.company ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <HealthBadge health={c.health} />
                      </TableCell>
                      <TableCell className="tabular text-right text-sm">
                        <span className="font-medium">{c.ticketCount}</span>
                        {c.openTicketCount > 0 && <span className="ml-1.5 text-xs text-primary">{c.openTicketCount} open</span>}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{c.lastTicketAt ? timeAgo(c.lastTicketAt) : "—"}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">{shortDate(c.createdAt)}</TableCell>
                      <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" aria-label="Actions">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate({ to: "/tickets/new", search: { customerId: c.id } })}>
                              <Ticket className="mr-2 size-4" /> New ticket
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditing(c)}>
                              <Pencil className="mr-2 size-4" /> Edit
                            </DropdownMenuItem>
                            {user.role === "admin" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(c)}>
                                  <Trash2 className="mr-2 size-4" /> Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data && data.meta.pageCount > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                  <span className="text-muted-foreground">
                    Page {data.meta.page} of {data.meta.pageCount}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" className="size-8" disabled={data.meta.page <= 1} onClick={() => navigate({ search: (p: Search) => ({ ...p, page: data.meta.page - 1 }) })}>
                      <ChevronLeft />
                    </Button>
                    <Button variant="outline" size="icon" className="size-8" disabled={data.meta.page >= data.meta.pageCount} onClick={() => navigate({ search: (p: Search) => ({ ...p, page: data.meta.page + 1 }) })}>
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <CustomerDialog
        open={!!isNew || !!editing}
        customer={editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            if (isNew) update({ new: undefined });
          }
        }}
        onSaved={(c) => {
          if (!editing) navigate({ to: "/customers/$customerId", params: { customerId: c.id } });
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description={`This also deletes their ${deleting?.ticketCount ?? 0} ticket(s) and all related history. This can't be undone.`}
        onConfirm={async () => {
          try {
            await del.mutateAsync(deleting!.id);
            toast.success("Customer deleted");
          } catch (e) {
            toast.error((e as Error).message);
          }
          setDeleting(null);
        }}
      />
    </>
  );
}
