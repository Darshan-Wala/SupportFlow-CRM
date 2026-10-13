import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleCheckBig,
  Inbox,
  Plus,
  Sparkles,
  Ticket,
  UserPlus,
  UserX,
  Users,
  Zap,
} from "lucide-react";
import { ACTIVE_STATUSES, type TicketListItem } from "@shared/domain";
import { PriorityBadge, SlaBadge, StatusBadge } from "@/components/common/badges";
import { EmptyState, PageHeader, QueryError, StatCard, UserAvatar } from "@/components/common/misc";
import { BarList } from "@/components/charts/BarList";
import { VolumeChart } from "@/components/charts/VolumeChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/lib/auth";
import { SERIES } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { dashboardQuery, healthQuery, usersQuery } from "@/lib/queries";
import { useTitle } from "@/lib/use-title";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

const ACTIVE = [...ACTIVE_STATUSES];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function DashboardPage() {
  useTitle("Dashboard");
  const { user, workspace } = useMe();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery(dashboardQuery);

  const toTickets = (search: Record<string, unknown>) => navigate({ to: "/tickets", search: search as never });

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={`Here's what's happening in ${workspace.name} right now.`}
      />

      {error ? (
        <QueryError error={error} onRetry={refetch} />
      ) : isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-6">
          {data.counts.totalTickets === 0 && <Onboarding hasCustomers={data.counts.totalCustomers > 0} />}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Active tickets" value={data.counts.active} icon={Inbox} hint={`${data.counts.open} open · ${data.counts.pending} pending`} onClick={() => toTickets({ status: ACTIVE })} />
            <StatCard label="Unassigned" value={data.counts.unassigned} icon={UserX} tone={data.counts.unassigned ? "warning" : "default"} hint="Waiting for an owner" onClick={() => toTickets({ status: ACTIVE, assignee: "unassigned" })} />
            <StatCard label="Urgent" value={data.counts.urgent} icon={Zap} tone={data.counts.urgent ? "danger" : "default"} hint="Active, urgent priority" onClick={() => toTickets({ status: ACTIVE, priority: ["Urgent"] })} />
            <StatCard label="SLA breached" value={data.counts.breached} icon={AlertTriangle} tone={data.counts.breached ? "danger" : "default"} hint={`${data.counts.atRisk} at risk`} onClick={() => toTickets({ status: ACTIVE, sla: "breached" })} />
            <StatCard label="Created · 24h" value={data.counts.created24h} icon={Ticket} hint="New tickets today" />
            <StatCard label="Resolved · 24h" value={data.counts.resolved24h} icon={CircleCheckBig} tone="success" hint="Closed out today" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Ticket volume</CardTitle>
                <p className="text-sm text-muted-foreground">Created vs. resolved, last 14 days</p>
              </CardHeader>
              <CardContent>
                <VolumeChart data={data.volume} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Active by status</CardTitle>
                <p className="text-sm text-muted-foreground">Where the open work sits</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <BarList
                  items={data.byStatus}
                  colors={SERIES}
                  onSelect={(s) => toTickets({ status: [s] })}
                  emptyLabel="Nothing open — inbox zero"
                />
                <div>
                  <p className="mb-3 text-sm font-medium">Customer sentiment (active)</p>
                  <BarList
                    items={data.bySentiment}
                    colors={["var(--series-3)", "var(--series-1)", "var(--series-2)"]}
                    emptyLabel="No active tickets"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">Needs attention</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Breached or at-risk SLAs and high priority</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toTickets({ status: ACTIVE, sort: "priority", order: "desc" })}>
                  View all <ArrowRight />
                </Button>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                {data.needsAttention.length ? (
                  <TicketMiniList tickets={data.needsAttention} showSla />
                ) : (
                  <EmptyState icon={CheckCircle2} title="All clear" description="No urgent tickets or SLA risks right now." className="py-8" />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">Latest tickets</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Most recently created</p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/tickets">
                    View all <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                {data.recent.length ? (
                  <TicketMiniList tickets={data.recent} />
                ) : (
                  <EmptyState icon={Inbox} title="No tickets yet" description="Tickets you create will show up here." className="py-8" />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function TicketMiniList({ tickets, showSla }: { tickets: TicketListItem[]; showSla?: boolean }) {
  return (
    <ul className="divide-y">
      {tickets.map((t) => (
        <li key={t.id}>
          <Link
            to="/tickets/$ticketId"
            params={{ ticketId: t.key }}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/60"
          >
            <UserAvatar name={t.customer.name} className="size-8" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.subject}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{t.key}</span> · {t.customer.name} · {timeAgo(t.createdAt)}
              </p>
            </div>
            <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
              {showSla ? <SlaBadge sla={t.sla} /> : <StatusBadge status={t.status} />}
              <PriorityBadge priority={t.priority} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Onboarding({ hasCustomers }: { hasCustomers: boolean }) {
  const { user } = useMe();
  const users = useQuery(usersQuery);
  const health = useQuery(healthQuery);
  const steps = [
    {
      done: hasCustomers,
      icon: Users,
      title: "Add your first customer",
      text: "Customers are the people and companies who raise tickets.",
      action: (
        <Button size="sm" variant="outline" asChild>
          <Link to="/customers" search={{ new: true }}>Add customer</Link>
        </Button>
      ),
    },
    {
      done: false,
      icon: Ticket,
      title: "Create a ticket",
      text: "AI will suggest a category, priority and a first reply.",
      action: (
        <Button size="sm" asChild>
          <Link to="/tickets/new">Create ticket</Link>
        </Button>
      ),
    },
    {
      done: (users.data?.length ?? 1) > 1,
      icon: UserPlus,
      title: "Invite your team",
      text: user.role === "admin" ? "Add agents so tickets can be assigned." : "Ask an admin to add teammates.",
      action:
        user.role === "admin" ? (
          <Button size="sm" variant="outline" asChild>
            <Link to="/settings" search={{ tab: "team" }}>Add teammate</Link>
          </Button>
        ) : null,
    },
    {
      done: health.data?.ai.provider === "gemini",
      icon: Sparkles,
      title: "Connect Gemini",
      text: "Set GEMINI_API_KEY on the server for AI-written analysis.",
      action: (
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings" search={{ tab: "system" }}>Check status</Link>
        </Button>
      ),
    },
  ];
  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="bg-gradient-to-r from-primary/8 to-transparent pb-4">
        <CardTitle className="text-base">Get your workspace ready</CardTitle>
        <p className="text-sm text-muted-foreground">Your workspace is empty — everything here comes from data your team enters.</p>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s) => (
          <div key={s.title} className={cn("flex flex-col gap-2 rounded-lg border p-4", s.done && "bg-muted/40")}>
            <div className="flex items-center gap-2">
              {s.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
              <p className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through")}>{s.title}</p>
            </div>
            <p className="text-xs text-muted-foreground">{s.text}</p>
            {!s.done && s.action && <div className="mt-auto pt-1">{s.action}</div>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-[340px] rounded-xl lg:col-span-2" />
        <Skeleton className="h-[340px] rounded-xl" />
      </div>
    </div>
  );
}
