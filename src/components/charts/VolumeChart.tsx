import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VolumePoint } from "@/lib/queries";

const SERIES = [
  { key: "created", label: "Created", color: "var(--series-1)" },
  { key: "resolved", label: "Resolved", color: "var(--series-2)" },
] as const;

export function VolumeChart({ data, height = 260 }: { data: VolumePoint[]; height?: number }) {
  const totals = {
    created: data.reduce((a, d) => a + d.created, 0),
    resolved: data.reduce((a, d) => a + d.resolved, 0),
  };
  const dense = data.length > 31;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
            <span className="tabular font-medium text-foreground">{totals[s.key]}</span>
          </span>
        ))}
      </div>
      <div style={{ height }} className="relative" role="img" aria-label={`Tickets created (${totals.created}) and resolved (${totals.resolved}) per day`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={dense ? 24 : 12}
              tickFormatter={(d: string) => format(parseISO(d), "MMM d")}
            />
            <YAxis allowDecimals={false} domain={[0, (max: number) => Math.max(4, max)]} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-[var(--shadow-elevated)]">
                    <p className="mb-1 font-medium">{format(parseISO(String(label)), "EEE, MMM d")}</p>
                    {SERIES.map((s) => (
                      <p key={s.key} className="flex items-center gap-2 text-muted-foreground">
                        <span className="size-2 rounded-full" style={{ background: s.color }} />
                        {s.label}
                        <span className="tabular ml-auto pl-4 font-medium text-foreground">
                          {payload.find((p) => p.dataKey === s.key)?.value as number}
                        </span>
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {totals.created + totals.resolved === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="rounded-md bg-card/90 px-3 py-1.5 text-sm text-muted-foreground">No tickets in this period yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
