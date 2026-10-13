import { cn } from "@/lib/utils";

export function Logo({ inverted, collapsed }: { inverted?: boolean; collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" className={inverted ? "fill-white" : "fill-primary"} />
        <path
          d="M9 11.5c0-1.4 1.1-2.5 2.5-2.5h9c1.4 0 2.5 1.1 2.5 2.5v6c0 1.4-1.1 2.5-2.5 2.5H15l-4 3.2V20h.5C10.1 20 9 18.9 9 17.5z"
          className={inverted ? "fill-[oklch(0.24_0.06_264)]" : "fill-primary-foreground"}
        />
      </svg>
      {!collapsed && (
        <span className={cn("text-[17px] font-semibold tracking-tight", inverted && "text-white")}>SupportFlow</span>
      )}
    </div>
  );
}
