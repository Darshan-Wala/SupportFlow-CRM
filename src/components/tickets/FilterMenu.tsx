import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function FilterMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T[] | undefined;
  onChange: (v: T[] | undefined) => void;
  render?: (o: T) => ReactNode;
}) {
  const selected = value ?? [];
  const toggle = (o: T) => {
    const next = selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o];
    onChange(next.length ? next : undefined);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9 border-dashed", selected.length && "border-solid border-primary/40 bg-primary/5")}>
          {label}
          {selected.length > 0 && (
            <span className="rounded bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{selected.length}</span>
          )}
          <ChevronDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              onClick={() => toggle(o)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-[4px] border",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {on && <Check className="size-3" />}
              </span>
              {render ? render(o) : o}
            </button>
          );
        })}
        {selected.length > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            <button onClick={() => onChange(undefined)} className="w-full rounded-sm px-2 py-1.5 text-center text-xs text-muted-foreground hover:bg-accent">
              Clear
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
