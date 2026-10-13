import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Building2, Inbox, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { HealthBadge, PriorityBadge, SlaBadge, StatusBadge } from "@/components/common/badges";
import { EmptyState, QueryError, StatCard, UserAvatar } from "@/components/common/misc";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/lib/auth";
import { shortDate, timeAgo } from "@/lib/format";
import { customerQuery, ticketsQuery, useDeleteCustomer } from "@/lib/queries";
import { useTitle } from "@/lib/use-title";

export const Route = createFileRoute("/_app/customers/$customerId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(customerQuery(params.customerId)),
  pendingComponent: () => (
    <div className="space-y-4">
      <Skeleton className="h-16 w-1/2" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  ),
  errorComponent: ({ error }) => <QueryError error={error} />,
  component: CustomerPage,
});

function CustomerPage() {
  const { customerId } = Route.useParams();
  const { data: c } = useQuery(customerQuery(customerId));
  const tickets = useQuery(ticketsQuery({ customerId, limit: 50, sort: "createdAt", order: "desc" }));
  const navigate = useNavigate();
  const { user } = useMe();
  const del = useDeleteCustomer();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useTitle(c?.name);
  if (!c) return null;

  const resolved = tickets.data?.data.filter((t) => t.status === "Resolved" || t.status === "Closed").length ?? 0;

  return (
    <div className="space-y-6">
      <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Customers
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar name={c.name} className="size-14 text-base" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{c.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {c.company && <span>{c.company}</span>}
              <HealthBadge health={c.health} />
              <span>· Customer since {shortDate(c.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
          {user.role === "admin" && (
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirm(true)}>
              <Trash2 />
            </Button>
          )}
          <Button asChild>
            <Link to="/tickets/new" search={{ customerId: c.id }}>
              <Plus /> New ticket
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-primary hover:underline">
                <Mail className="size-4 text-muted-foreground" /> <span className="truncate">{c.email}</span>
              </a>
              <p className="flex items-center gap-2">
                <Phone className="size-4 text-muted-foreground" /> {c.phone || <span className="text-muted-foreground">No phone</span>}
              </p>
              <p className="flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" /> {c.company || <span className="text-muted-foreground">No company</span>}
              </p>
              {c.notes && (
                <div className="border-t pt-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap">{c.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
            <StatCard label="Total tickets" value={c.ticketCount} />
            <StatCard label="Open now" value={c.openTicketCount} tone={c.openTicketCount ? "warning" : "default"} />
            <StatCard label="Resolved" value={resolved} tone="success" />
            <StatCard label="Last ticket" value={<span className="text-base">{c.lastTicketAt ? timeAgo(c.lastTicketAt) : "—"}</span>} />
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ticket history</CardTitle>
          </CardHeader>
          {tickets.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : !tickets.data?.data.length ? (
            <EmptyState
              icon={Inbox}
              title="No tickets yet"
              description={`Log the first request from ${c.name.split(" ")[0]}.`}
              action={
                <Button asChild size="sm">
                  <Link to="/tickets/new" search={{ customerId: c.id }}>
                    <Plus /> New ticket
                  </Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Ticket</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Priority</TableHead>
                  <TableHead className="hidden md:table-cell">SLA</TableHead>
                  <TableHead className="hidden pr-4 text-right md:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.data.data.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate({ to: "/tickets/$ticketId", params: { ticketId: t.key } })}>
                    <TableCell className="max-w-0 min-w-[200px] pl-4">
                      <p className="truncate font-medium">{t.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{t.key}</span> · {t.category}
                        {t.assignee ? ` · ${t.assignee.name}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <PriorityBadge priority={t.priority} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <SlaBadge sla={t.sla} compact />
                    </TableCell>
                    <TableCell className="hidden pr-4 text-right text-xs text-muted-foreground md:table-cell">{shortDate(t.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <CustomerDialog open={editing} onOpenChange={setEditing} customer={c} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${c.name}?`}
        description={`This permanently deletes the customer and their ${c.ticketCount} ticket(s).`}
        onConfirm={async () => {
          try {
            await del.mutateAsync(c.id);
            toast.success("Customer deleted");
            navigate({ to: "/customers" });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}
