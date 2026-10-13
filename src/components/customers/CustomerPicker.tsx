import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { useState } from "react";
import { UserAvatar } from "@/components/common/misc";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { customerQuery, customersQuery } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";

export function CustomerPicker({
  value,
  onChange,
  onCreateNew,
  invalid,
}: {
  value: string | undefined;
  onChange: (id: string) => void;
  onCreateNew: (prefill: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const term = useDebounced(q, 200);
  const list = useQuery({ ...customersQuery({ search: term || undefined, limit: 8, sort: "lastTicketAt" }), enabled: open });
  const current = useQuery({ ...customerQuery(value ?? ""), enabled: !!value });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-10 w-full justify-between font-normal", invalid && "border-destructive")}
        >
          {current.data ? (
            <span className="flex min-w-0 items-center gap-2">
              <UserAvatar name={current.data.name} className="size-6" />
              <span className="truncate">{current.data.name}</span>
              <span className="truncate text-muted-foreground">{current.data.email}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Select a customer…</span>
          )}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input value={q} onValueChange={setQ} placeholder="Search name, email or company…" className="h-10 flex-1 bg-transparent text-sm outline-none" />
          </div>
          <Command.List className="max-h-64 overflow-y-auto p-1">
            {list.isLoading && <p className="p-3 text-center text-sm text-muted-foreground">Loading…</p>}
            {!list.isLoading && list.data?.data.length === 0 && (
              <p className="p-3 text-center text-sm text-muted-foreground">{term ? "No matching customers" : "No customers yet"}</p>
            )}
            {list.data?.data.map((c) => (
              <Command.Item
                key={c.id}
                value={c.id}
                onSelect={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-accent"
              >
                <UserAvatar name={c.name} className="size-6" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.company ? `${c.company} · ` : ""}{c.email}</p>
                </div>
                {value === c.id && <Check className="size-4 text-primary" />}
              </Command.Item>
            ))}
          </Command.List>
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreateNew(q);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm font-medium text-primary hover:bg-accent"
            >
              <Plus className="size-4" /> New customer{q ? ` "${q}"` : ""}
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
