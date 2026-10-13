import { cn } from "@/lib/utils";

/**
 * Horizontal bar list with direct labels and values (accessible without colour).
 * `colors` maps each item to a fixed categorical slot so an entity keeps its colour across charts.
 */
export function BarList({
  items,
  colors,
  format = (n) => String(n),
  onSelect,
  emptyLabel = "No data yet",
}: {
  items: { name: string; value: number }[];
  colors?: string[];
  format?: (n: number) => string;
  onSelect?: (name: string) => void;
  emptyLabel?: string;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  const total = items.reduce((a, i) => a + i.value, 0);
  if (total === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => {
        const Comp = onSelect ? "button" : "div";
        return (
          <li key={it.name}>
            <Comp
              onClick={onSelect ? () => onSelect(it.name) : undefined}
              title={`${it.name}: ${format(it.value)} (${total ? Math.round((it.value / total) * 100) : 0}%)`}
              className={cn("group block w-full text-left", onSelect && "cursor-pointer")}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className={cn("truncate", onSelect && "group-hover:underline")}>{it.name}</span>
                <span className="tabular shrink-0 text-muted-foreground">
                  <span className="font-medium text-foreground">{format(it.value)}</span>
                  <span className="ml-1.5 text-xs">{total ? Math.round((it.value / total) * 100) : 0}%</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${max ? (it.value / max) * 100 : 0}%`, background: colors?.[i] ?? "var(--series-1)" }}
                />
              </div>
            </Comp>
          </li>
        );
      })}
    </ul>
  );
}
