import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, BarChart3, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { z } from "zod";
import { EmptyState, PageHeader, QueryError, UserAvatar } from "@/components/common/misc";
import { BarList } from "@/components/charts/BarList";
import { VolumeChart } from "@/components/charts/VolumeChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PRIORITY_RAMP, SERIES } from "@/lib/constants";
import { hours, pct } from "@/lib/format";
import { analyticsQuery } from "@/lib/queries";
import { useTitle } from "@/lib/use-title";
import { cn } from "@/lib/utils";

const RANGES = [7, 30, 90, 180, 365] as const;

export const Route = createFileRoute("/_app/analytics")({
  validateSearch: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(180), z.literal(365)]).optional().catch(undefined) }),
  component: AnalyticsPage,
});

function Delta({ change, lowerIsBetter }: { change: number | null; lowerIsBetter?: boolean }) {
  if (change == null || change === 0) return <span className="text-xs text-muted-foreground">No prior period data</span>;
  const up = change > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-success" : "text-destructive")}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {Math.abs(change)}% <span className="ml-1 font-normal text-muted-foreground">vs previous period</span>
    </span>
  );
}

function Kpi({ label, value, change, lowerIsBetter, hint }: { label: string; value: ReactNode; change: number | null; lowerIsBetter?: boolean; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground" title={hint}>
        {label}
      </p>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <div className="mt-1.5">
        <Delta change={change} lowerIsBetter={lowerIsBetter} />
      </div>
    </Card>
  );
}

function AnalyticsPage() {
  useTitle("Analytics");
  const { days = 30 } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data, isLoading, error, refetch, isFetching } = useQuery(analyticsQuery(days));

  const empty = data && data.kpis.created.value === 0 && data.kpis.resolved.value === 0 && data.kpis.backlog.value === 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Performance of your support team, calculated from your tickets."
        actions={
          <div className="flex rounded-lg border bg-card p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => navigate({ search: { days: r }, replace: true })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  days === r ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r === 365 ? "1y" : `${r}d`}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <QueryError error={error} onRetry={refetch} />
      ) : isLoading || !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : empty ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No data for this period"
            description="Analytics fill in as your team creates and resolves tickets."
            action={
              <Button asChild>
                <Link to="/tickets/new">
                  <Plus /> Create a ticket
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className={cn("space-y-6 transition-opacity", isFetching && "opacity-70")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Tickets created" value={data.kpis.created.value} change={data.kpis.created.change} />
            <Kpi label="Tickets resolved" value={data.kpis.resolved.value} change={data.kpis.resolved.change} />
            <Kpi label="Current backlog" value={data.kpis.backlog.value} change={null} hint="Open, in progress and pending right now" />
            <Kpi label="Avg first response" value={hours(data.kpis.avgFirstResponseHours.value)} change={data.kpis.avgFirstResponseHours.change} lowerIsBetter />
            <Kpi label="Avg resolution time" value={hours(data.kpis.avgResolutionHours.value)} change={data.kpis.avgResolutionHours.change} lowerIsBetter />
            <Kpi label="SLA compliance" value={pct(data.kpis.slaCompliance.value)} change={data.kpis.slaCompliance.change} hint="Share of resolved tickets closed within their SLA target" />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ticket volume</CardTitle>
              <p className="text-sm text-muted-foreground">Created vs. resolved per day</p>
            </CardHeader>
            <CardContent>
              <VolumeChart data={data.volume} height={280} />
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <Breakdown title="By category" items={data.byCategory} />
            <Breakdown title="By priority" items={data.byPriority} colors={PRIORITY_RAMP} />
            <Breakdown title="By channel" items={data.byChannel} />
            <Breakdown title="By sentiment" items={data.bySentiment} colors={["var(--series-3)", "var(--series-1)", "var(--series-2)"]} subtitle="AI-detected" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Team performance</CardTitle>
                <p className="text-sm text-muted-foreground">Tickets created or resolved in the selected period</p>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Agent</TableHead>
                      <TableHead className="text-right">Assigned</TableHead>
                      <TableHead className="text-right">Active now</TableHead>
                      <TableHead className="text-right">Resolved</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Avg resolution</TableHead>
                      <TableHead className="hidden pr-6 text-right sm:table-cell">SLA met</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.agents.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="pl-6">
                          <span className="flex items-center gap-2">
                            <UserAvatar name={a.name} className="size-7" />
                            <span className="font-medium">{a.name}</span>
                            {a.role === "admin" && <span className="text-xs text-muted-foreground">Admin</span>}
                          </span>
                        </TableCell>
                        <TableCell className="tabular text-right">{a.assigned}</TableCell>
                        <TableCell className="tabular text-right">{a.active}</TableCell>
                        <TableCell className="tabular text-right font-medium">{a.resolved}</TableCell>
                        <TableCell className="tabular hidden text-right sm:table-cell">{hours(a.avgResolutionHours)}</TableCell>
                        <TableCell className="tabular hidden pr-6 text-right sm:table-cell">{pct(a.slaCompliance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Resolution time by priority</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarList
                    items={data.resolutionByPriority.map((r) => ({ name: `${r.name} (${r.count})`, value: r.hours ?? 0 }))}
                    format={(n) => hours(n)}
                    colors={PRIORITY_RAMP}
                    emptyLabel="No tickets resolved in this period"
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top customers by volume</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.topCustomers.length ? (
                    <ul className="space-y-2">
                      {data.topCustomers.map((c) => (
                        <li key={c.id}>
                          <Link to="/customers/$customerId" params={{ customerId: c.id }} className="flex items-center gap-3 rounded-md p-1.5 hover:bg-muted">
                            <UserAvatar name={c.name} className="size-7" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{c.name}</span>
                              {c.company && <span className="block truncate text-xs text-muted-foreground">{c.company}</span>}
                            </span>
                            <span className="tabular text-sm font-medium">{c.count}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">No tickets in this period</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Breakdown({ title, subtitle, items, colors = SERIES }: { title: string; subtitle?: string; items: { name: string; value: number }[]; colors?: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>
        <BarList items={items} colors={colors} emptyLabel="No tickets in this period" />
      </CardContent>
    </Card>
  );
}
