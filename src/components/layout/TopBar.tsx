import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Moon, Plus, Search, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { healthQuery } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function TopBar({ onSearch }: { onSearch: () => void }) {
  const { theme, toggle } = useTheme();
  const { data: health } = useQuery(healthQuery);
  const gemini = health?.ai.provider === "gemini";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />
      <button
        onClick={onSearch}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:max-w-md"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search tickets, customers, pages…</span>
        <kbd className="ml-auto hidden rounded border bg-background px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        {health && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/settings"
                search={{ tab: "system" }}
                className={cn(
                  "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium md:inline-flex",
                  gemini ? "border-primary/25 bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                <Sparkles className="size-3.5" />
                {gemini ? "Gemini AI" : "Rule-based AI"}
              </Link>
            </TooltipTrigger>
            <TooltipContent>
              {gemini ? `Tickets are analysed by ${health.ai.model}` : "Set GEMINI_API_KEY to enable Gemini analysis"}
            </TooltipContent>
          </Tooltip>
        )}
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
        <Button asChild size="sm">
          <Link to="/tickets/new">
            <Plus /> <span className="hidden sm:inline">New ticket</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
