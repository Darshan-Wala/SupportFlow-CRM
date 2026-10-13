import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { BarChart3, LayoutDashboard, Plus, Search, Settings, Ticket, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/common/badges";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { customersQuery, ticketsQuery } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounce";

const item =
  "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground";
const group = "px-1.5 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 200);
  const enabled = open && term.length >= 2;
  const tickets = useQuery({ ...ticketsQuery({ search: term, limit: 6 }), enabled });
  const customers = useQuery({ ...customersQuery({ search: term, limit: 5 }), enabled });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  const pages = [
    { label: "Dashboard", icon: LayoutDashboard, to: "/" },
    { label: "Tickets", icon: Ticket, to: "/tickets" },
    { label: "Customers", icon: Users, to: "/customers" },
    { label: "Analytics", icon: BarChart3, to: "/analytics" },
    { label: "Settings", icon: Settings, to: "/settings" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command shouldFilter={!enabled} loop>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input
              value={q}
              onValueChange={setQ}
              placeholder="Search tickets by ID, subject or customer…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto py-1 scrollbar-thin">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              {enabled && (tickets.isFetching || customers.isFetching) ? "Searching…" : "No results found."}
            </Command.Empty>

            {enabled && !!tickets.data?.data.length && (
              <Command.Group heading="Tickets" className={group}>
                {tickets.data.data.map((t) => (
                  <Command.Item
                    key={t.id}
                    value={`ticket-${t.id}`}
                    className={item}
                    onSelect={() => go(() => navigate({ to: "/tickets/$ticketId", params: { ticketId: t.key } }))}
                  >
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{t.key}</span>
                    <span className="min-w-0 flex-1 truncate">{t.subject}</span>
                    <StatusBadge status={t.status} />
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {enabled && !!customers.data?.data.length && (
              <Command.Group heading="Customers" className={group}>
                {customers.data.data.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`customer-${c.id}`}
                    className={item}
                    onSelect={() => go(() => navigate({ to: "/customers/$customerId", params: { customerId: c.id } }))}
                  >
                    <Users />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{c.company ?? c.email}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {!enabled && (
              <>
                <Command.Group heading="Actions" className={group}>
                  <Command.Item className={item} onSelect={() => go(() => navigate({ to: "/tickets/new" }))}>
                    <Plus /> Create ticket
                  </Command.Item>
                  <Command.Item className={item} onSelect={() => go(() => navigate({ to: "/customers", search: { new: true } }))}>
                    <UserPlus /> Add customer
                  </Command.Item>
                </Command.Group>
                <Command.Group heading="Go to" className={group}>
                  {pages.map((p) => (
                    <Command.Item key={p.to} className={item} onSelect={() => go(() => navigate({ to: p.to }))}>
                      <p.icon /> {p.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              </>
            )}
          </Command.List>
          <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span>Type at least 2 characters to search</span>
            <span>
              <kbd className="font-mono">↑↓</kbd> navigate · <kbd className="font-mono">↵</kbd> open
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
