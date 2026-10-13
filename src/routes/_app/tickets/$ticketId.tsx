import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  CircleDot,
  Lock,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  StickyNote,
  Trash2,
  UserRound,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  TICKET_CATEGORIES,
  TICKET_CHANNELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketActivity,
  type TicketListItem,
  type TicketNote,
  type TicketPriority,
  type TicketStatus,
} from "@shared/domain";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { HealthBadge, PriorityBadge, SlaBadge, StatusBadge } from "@/components/common/badges";
import { EmptyState, Field, QueryError, UserAvatar } from "@/components/common/misc";
import { AiInsights } from "@/components/tickets/AiPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/lib/auth";
import { fullDate, shortDate, timeAgo } from "@/lib/format";
import {
  ticketQuery,
  ticketsQuery,
  useAddNote,
  useDeleteTicket,
  useReanalyze,
  useUpdateTicket,
  usersQuery,
  type TicketUpdate,
} from "@/lib/queries";
import { useTitle } from "@/lib/use-title";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/tickets/$ticketId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(ticketQuery(params.ticketId)),
  pendingComponent: DetailSkeleton,
  errorComponent: ({ error }) => (
    <div className="space-y-4">
      <BackLink />
      <QueryError error={error} />
    </div>
  ),
  component: TicketDetailPage,
});

function BackLink() {
  return (
    <Link to="/tickets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Tickets
    </Link>
  );
}

function TicketDetailPage() {
  const { ticketId } = Route.useParams();
  const { data } = useQuery(ticketQuery(ticketId));
  const navigate = useNavigate();
  const { user } = useMe();
  const t = data!.ticket;
  useTitle(`${t.key} · ${t.subject}`);

  const update = useUpdateTicket(t.id);
  const reanalyze = useReanalyze(t.id);
  const del = useDeleteTicket();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState<{ body: string; internal: boolean } | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const clearDraft = useCallback(() => setDraft(null), []);

  async function save(patch: TicketUpdate, msg?: string) {
    try {
      await update.mutateAsync(patch);
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function runAnalyze() {
    try {
      const r = await reanalyze.mutateAsync();
      toast.success("Analysis updated", { description: r.ai?.summary });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <BackLink />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono font-medium text-foreground">{t.key}</span>
            <span>·</span>
            <span>Opened {timeAgo(t.createdAt)} via {t.channel}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{t.subject}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            <SlaBadge sla={t.sla} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {t.status !== "Resolved" && t.status !== "Closed" ? (
            <Button variant="outline" onClick={() => save({ status: "Resolved" }, "Ticket resolved")} disabled={update.isPending}>
              <CircleDot /> Mark resolved
            </Button>
          ) : (
            <Button variant="outline" onClick={() => save({ status: "Open" }, "Ticket reopened")} disabled={update.isPending}>
              <RefreshCw /> Reopen
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil className="mr-2 size-4" /> Edit subject & description
              </DropdownMenuItem>
              <DropdownMenuItem onClick={runAnalyze}>
                <Sparkles className="mr-2 size-4" /> Re-run AI analysis
              </DropdownMenuItem>
              {user.role === "admin" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="mr-2 size-4" /> Delete ticket
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-3">
                <UserAvatar name={t.customer.name} className="size-9" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.customer.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.customer.email} · {shortDate(t.createdAt)}
                  </p>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{t.description}</p>
            </CardContent>
          </Card>

          <Timeline notes={data!.notes} activities={data!.activities} />

          <div ref={composerRef}>
            <Composer ticket={t} draft={draft} onDraftConsumed={clearDraft} />
          </div>
        </div>

        <aside className="space-y-6">
          <PropertiesCard ticket={t} onSave={save} saving={update.isPending} />

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" /> AI insights
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={runAnalyze} disabled={reanalyze.isPending}>
                {reanalyze.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Re-run
              </Button>
            </CardHeader>
            <CardContent>
              {t.ai ? (
                <AiInsights
                  ai={t.ai}
                  onUseReply={(body) => {
                    setDraft({ body: body.replace(/The Support Team\s*$/, user.name), internal: false });
                    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  extra={
                    (t.ai.category !== t.category || t.ai.priority !== t.priority) && (
                      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        AI suggests <b className="text-foreground">{t.ai.category}</b> · <b className="text-foreground">{t.ai.priority}</b>, the
                        ticket is set to {t.category} · {t.priority}.
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 w-full"
                          onClick={() => save({ category: t.ai!.category, priority: t.ai!.priority }, "Applied AI suggestion")}
                        >
                          <Wand2 /> Apply suggestion
                        </Button>
                      </div>
                    )
                  }
                />
              ) : (
                <EmptyState icon={Bot} title="Not analysed yet" description="Run the analysis to get a summary and reply draft." className="py-6" />
              )}
            </CardContent>
          </Card>

          <CustomerCard ticket={t} />
        </aside>
      </div>

      <EditDialog ticket={t} open={editing} onOpenChange={setEditing} onSave={(p) => save(p, "Ticket updated")} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${t.key}?`}
        description="The ticket, its conversation and history will be permanently deleted."
        onConfirm={async () => {
          try {
            await del.mutateAsync(t.id);
            toast.success(`${t.key} deleted`);
            navigate({ to: "/tickets" });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

type Entry = { kind: "note"; at: string; note: TicketNote } | { kind: "activity"; at: string; activity: TicketActivity };

function Timeline({ notes, activities }: { notes: TicketNote[]; activities: TicketActivity[] }) {
  const [filter, setFilter] = useState<"all" | "conversation" | "activity">("all");
  const entries = useMemo<Entry[]>(() => {
    const e: Entry[] = [
      ...notes.map((n) => ({ kind: "note" as const, at: n.createdAt, note: n })),
      // Reply/note activities duplicate the note itself, so hide them from the merged view.
      ...activities
        .filter((a) => a.type !== "reply" && a.type !== "note")
        .map((a) => ({ kind: "activity" as const, at: a.createdAt, activity: a })),
    ];
    return e
      .filter((x) => filter === "all" || (filter === "conversation" ? x.kind === "note" : x.kind === "activity"))
      .sort((a, b) => a.at.localeCompare(b.at));
  }, [notes, activities, filter]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Conversation & history</CardTitle>
        <div className="flex rounded-md border p-0.5 text-xs">
          {(["all", "conversation", "activity"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn("rounded px-2 py-1 capitalize", filter === f ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {f}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {filter === "conversation" ? "No replies or notes yet." : "Nothing here yet."}
          </p>
        ) : (
          <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border">
            {entries.map((e) =>
              e.kind === "note" ? (
                <li key={e.note.id} className="relative flex gap-3">
                  <UserAvatar name={e.note.authorName} className="relative z-10 size-8 ring-4 ring-card" />
                  <div
                    className={cn(
                      "min-w-0 flex-1 rounded-lg border p-3",
                      e.note.internal ? "border-warning/30 bg-warning/5" : "bg-card",
                    )}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-foreground">{e.note.authorName}</span>
                      {e.note.internal ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                          <Lock className="size-3" /> Internal note
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Mail className="size-3" /> Reply to customer
                        </span>
                      )}
                      <span className="text-muted-foreground" title={fullDate(e.at)}>
                        {timeAgo(e.at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{e.note.body}</p>
                  </div>
                </li>
              ) : (
                <li key={e.activity.id} className="relative flex items-center gap-3 pl-[7px]">
                  <span className="relative z-10 flex size-[18px] items-center justify-center rounded-full bg-muted ring-4 ring-card">
                    {e.activity.type === "ai" ? (
                      <Sparkles className="size-2.5 text-primary" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                    )}
                  </span>
                  <p className="ml-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{e.activity.actorName}</span> · {e.activity.message} ·{" "}
                    <span title={fullDate(e.at)}>{timeAgo(e.at)}</span>
                  </p>
                </li>
              ),
            )}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function Composer({
  ticket,
  draft,
  onDraftConsumed,
}: {
  ticket: TicketListItem;
  draft: { body: string; internal: boolean } | null;
  onDraftConsumed: () => void;
}) {
  const { user } = useMe();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState("");
  const add = useAddNote(ticket.id);

  useEffect(() => {
    if (!draft) return;
    setBody(draft.body);
    setMode(draft.internal ? "note" : "reply");
    onDraftConsumed();
  }, [draft, onDraftConsumed]);

  async function submit() {
    if (!body.trim()) return;
    try {
      await add.mutateAsync({ body: body.trim(), internal: mode === "note" });
      setBody("");
      toast.success(mode === "note" ? "Internal note added" : "Reply logged");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className={cn(mode === "note" && "border-warning/40")}>
      <div className="flex items-center gap-1 border-b px-2 pt-2">
        {(
          [
            ["reply", "Reply", MessageSquare],
            ["note", "Internal note", StickyNote],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
              mode === m ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      <CardContent className="p-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
          rows={5}
          className={cn("resize-y border-0 shadow-none focus-visible:ring-0", mode === "note" && "bg-warning/5")}
          placeholder={
            mode === "reply"
              ? `Write your response to ${ticket.customer.name.split(" ")[0]}…`
              : "Add context for your team — customers never see internal notes."
          }
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {mode === "reply"
              ? "Logged on the ticket as the customer-facing response. Ctrl/⌘ + Enter to send."
              : "Visible to your workspace only."}
          </p>
          <div className="flex gap-2">
            {mode === "reply" && ticket.ai && !body && (
              <Button size="sm" variant="ghost" onClick={() => setBody(ticket.ai!.suggestedReply.replace(/The Support Team\s*$/, user.name))}>
                <Sparkles /> Insert AI draft
              </Button>
            )}
            <Button size="sm" onClick={submit} disabled={!body.trim() || add.isPending}>
              {add.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {mode === "reply" ? "Send reply" : "Add note"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PropertiesCard({
  ticket: t,
  onSave,
  saving,
}: {
  ticket: TicketListItem;
  onSave: (p: TicketUpdate, msg?: string) => void;
  saving: boolean;
}) {
  const users = useQuery(usersQuery);
  const { user } = useMe();
  const row = "grid grid-cols-[96px_1fr] items-center gap-3";
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Properties</CardTitle>
        {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className={row}>
          <span className="text-muted-foreground">Status</span>
          <Select value={t.status} onValueChange={(v) => onSave({ status: v as TicketStatus })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  <StatusBadge status={s} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={row}>
          <span className="text-muted-foreground">Priority</span>
          <Select value={t.priority} onValueChange={(v) => onSave({ priority: v as TicketPriority })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  <PriorityBadge priority={p} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={row}>
          <span className="text-muted-foreground">Assignee</span>
          <Select value={t.assigneeId ?? "none"} onValueChange={(v) => onSave({ assigneeId: v === "none" ? null : v })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {(users.data ?? (t.assignee ? [t.assignee] : [])).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                  {u.id === user.id ? " (me)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!t.assigneeId && (
          <button onClick={() => onSave({ assigneeId: user.id }, "Assigned to you")} className="ml-[108px] text-xs font-medium text-primary hover:underline">
            Assign to me
          </button>
        )}
        <div className={row}>
          <span className="text-muted-foreground">Category</span>
          <Select value={t.category} onValueChange={(v) => onSave({ category: v as TicketListItem["category"] })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={row}>
          <span className="text-muted-foreground">Channel</span>
          <Select value={t.channel} onValueChange={(v) => onSave({ channel: v as TicketListItem["channel"] })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="!mt-4 space-y-2 border-t pt-4 text-xs">
          <Meta label="SLA target" value={`${t.sla.targetHours}h · due ${shortDate(t.sla.dueAt)}`} />
          <Meta label="Created" value={shortDate(t.createdAt)} title={fullDate(t.createdAt)} />
          <Meta label="First response" value={t.firstResponseAt ? shortDate(t.firstResponseAt) : "Awaiting"} />
          <Meta label="Resolved" value={t.resolvedAt ? shortDate(t.resolvedAt) : "—"} />
          <Meta label="Last updated" value={timeAgo(t.updatedAt)} title={fullDate(t.updatedAt)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Meta({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium" title={title}>
        {value}
      </span>
    </div>
  );
}

function CustomerCard({ ticket: t }: { ticket: TicketListItem }) {
  const others = useQuery(ticketsQuery({ customerId: t.customerId, limit: 6, sort: "createdAt", order: "desc" }));
  const list = others.data?.data.filter((x) => x.id !== t.id).slice(0, 5) ?? [];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="size-4" /> Customer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Link to="/customers/$customerId" params={{ customerId: t.customerId }} className="flex items-center gap-3 rounded-md hover:opacity-80">
          <UserAvatar name={t.customer.name} className="size-10" />
          <div className="min-w-0">
            <p className="truncate font-medium">{t.customer.name}</p>
            <p className="truncate text-xs text-muted-foreground">{t.customer.email}</p>
            {t.customer.company && <p className="truncate text-xs text-muted-foreground">{t.customer.company}</p>}
          </div>
        </Link>
        <HealthBadge health={t.customer.health} />
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Other tickets ({Math.max(0, (others.data?.meta.total ?? 1) - 1)})
          </p>
          {list.length ? (
            <ul className="space-y-1">
              {list.map((o) => (
                <li key={o.id}>
                  <Link
                    to="/tickets/$ticketId"
                    params={{ ticketId: o.key }}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{o.key}</span>
                    <span className="min-w-0 flex-1 truncate text-xs">{o.subject}</span>
                    <StatusBadge status={o.status} className="px-1.5 text-[10px]" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">This is their only ticket.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EditDialog({
  ticket,
  open,
  onOpenChange,
  onSave,
}: {
  ticket: TicketListItem;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (p: TicketUpdate) => Promise<void> | void;
}) {
  const [subject, setSubject] = useState(ticket.subject);
  const [description, setDescription] = useState(ticket.description);
  const [pending, setPending] = useState(false);
  const valid = subject.trim().length >= 3 && description.trim().length >= 10;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setSubject(ticket.subject);
          setDescription(ticket.description);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {ticket.key}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={8} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid || pending}
            onClick={async () => {
              setPending(true);
              await onSave({ subject: subject.trim(), description: description.trim() });
              setPending(false);
              onOpenChange(false);
            }}
          >
            {pending && <Loader2 className="animate-spin" />} Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-9 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}
