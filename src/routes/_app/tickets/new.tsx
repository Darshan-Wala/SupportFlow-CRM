import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  TICKET_CATEGORIES,
  TICKET_CHANNELS,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketChannel,
  type TicketPriority,
} from "@shared/domain";
import { Field, PageHeader } from "@/components/common/misc";
import { CustomerPicker } from "@/components/customers/CustomerPicker";
import { AiInsights } from "@/components/tickets/AiPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useAnalyzePreview, useCreateTicket, usersQuery } from "@/lib/queries";
import { useTitle } from "@/lib/use-title";

export const Route = createFileRoute("/_app/tickets/new")({
  validateSearch: z.object({ customerId: z.string().optional().catch(undefined) }),
  component: NewTicketPage,
});

const AUTO = "__auto";

function NewTicketPage() {
  useTitle("New ticket");
  const { customerId: initialCustomer } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useMe();
  const users = useQuery(usersQuery);
  const create = useCreateTicket();
  const preview = useAnalyzePreview();

  const [customerId, setCustomerId] = useState<string | undefined>(initialCustomer);
  const [newCustomer, setNewCustomer] = useState<{ name: string; email: string; company: string } | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState<TicketChannel>("Email");
  const [category, setCategory] = useState<string>(AUTO);
  const [priority, setPriority] = useState<string>(AUTO);
  const [assigneeId, setAssigneeId] = useState<string>(user.id);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const canAnalyze = subject.trim().length >= 3 && description.trim().length >= 10;

  function validate() {
    const e: Record<string, string> = {};
    if (!customerId && !newCustomer) e.customer = "Choose a customer or add a new one";
    if (newCustomer) {
      if (newCustomer.name.trim().length < 2) e.customerName = "Enter the customer's name";
      if (!/^\S+@\S+\.\S+$/.test(newCustomer.email.trim())) e.customerEmail = "Enter a valid email";
    }
    if (subject.trim().length < 3) e.subject = "Subject must be at least 3 characters";
    if (description.trim().length < 10) e.description = "Describe the issue in at least 10 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    try {
      const t = await create.mutateAsync({
        subject: subject.trim(),
        description: description.trim(),
        channel,
        ...(newCustomer
          ? { customer: { name: newCustomer.name.trim(), email: newCustomer.email.trim(), company: newCustomer.company.trim() || null } }
          : { customerId }),
        category: category === AUTO ? undefined : (category as TicketCategory),
        priority: priority === AUTO ? undefined : (priority as TicketPriority),
        assigneeId: assigneeId === "none" ? null : assigneeId,
      });
      toast.success(`${t.key} created`, {
        description: `${t.ai?.source === "gemini" ? "Gemini" : "AI"} triaged it as ${t.category} · ${t.priority}`,
      });
      navigate({ to: "/tickets/$ticketId", params: { ticketId: t.key } });
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v?.[0]])));
      }
      toast.error((err as Error).message);
    }
  }

  async function runPreview() {
    try {
      await preview.mutateAsync({ subject: subject.trim(), description: description.trim(), customerId });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="New ticket" description="Log a customer request. AI triages it the moment you save.">
        <Link to="/tickets" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Tickets
        </Link>
      </PageHeader>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_380px]" noValidate>
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {newCustomer ? (
                <div className="space-y-4 rounded-lg border border-dashed p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">New customer</p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setNewCustomer(null)}>
                      <X /> Pick existing instead
                    </Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" error={errors.customerName}>
                      <Input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} autoFocus />
                    </Field>
                    <Field label="Email" error={errors.customerEmail}>
                      <Input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
                    </Field>
                    <Field label="Company (optional)">
                      <Input value={newCustomer.company} onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })} />
                    </Field>
                  </div>
                  <p className="text-xs text-muted-foreground">If a customer with this email already exists, the ticket is linked to them.</p>
                </div>
              ) : (
                <Field label="Requester" error={errors.customer}>
                  <CustomerPicker
                    value={customerId}
                    onChange={setCustomerId}
                    invalid={!!errors.customer}
                    onCreateNew={(prefill) => {
                      setCustomerId(undefined);
                      setNewCustomer({
                        name: prefill.includes("@") ? "" : prefill,
                        email: prefill.includes("@") ? prefill : "",
                        company: "",
                      });
                    }}
                  />
                </Field>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Subject" htmlFor="subject" error={errors.subject}>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of the issue" maxLength={200} />
              </Field>
              <Field label="Description" htmlFor="description" error={errors.description} hint="Paste the customer's message or describe the problem in detail.">
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={8}
                  className="resize-y"
                  placeholder="What happened, what the customer expected, any error messages…"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Channel">
                  <Select value={channel} onValueChange={(v) => setChannel(v as TicketChannel)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_CHANNELS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Category">
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO}>✨ Let AI decide</SelectItem>
                      {TICKET_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO}>✨ Let AI decide</SelectItem>
                      {TICKET_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Assignee">
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {(users.data ?? [user]).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                          {u.id === user.id ? " (me)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/tickets">Cancel</Link>
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {create.isPending ? "Analysing & creating…" : "Create ticket"}
            </Button>
          </div>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" /> AI triage preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {preview.data ? (
                <AiInsights
                  ai={preview.data}
                  extra={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setCategory(preview.data!.category);
                        setPriority(preview.data!.priority);
                        toast.success("Applied AI category and priority");
                      }}
                    >
                      <Wand2 /> Apply category & priority
                    </Button>
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Fill in the subject and description, then preview how AI will categorise and prioritise this ticket — and the
                  first reply it suggests.
                </p>
              )}
              <Button type="button" variant="secondary" className="mt-4 w-full" disabled={!canAnalyze || preview.isPending} onClick={runPreview}>
                {preview.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {preview.data ? "Re-run analysis" : "Analyse with AI"}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </form>
    </>
  );
}
