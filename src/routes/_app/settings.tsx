import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Database, Loader2, Server, Sparkles, Trash2, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { SLA_HOURS, TICKET_PRIORITIES, type User, type UserRole } from "@shared/domain";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PriorityBadge } from "@/components/common/badges";
import { Field, PageHeader, UserAvatar } from "@/components/common/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import {
  healthQuery,
  useCreateUser,
  useDeleteUser,
  useRenameWorkspace,
  useUpdateMe,
  useUpdateUser,
  usersQuery,
} from "@/lib/queries";
import { useTitle } from "@/lib/use-title";

export const Route = createFileRoute("/_app/settings")({
  validateSearch: z.object({ tab: z.enum(["profile", "team", "system"]).optional().catch(undefined) }),
  component: SettingsPage,
});

function SettingsPage() {
  useTitle("Settings");
  const { tab = "profile" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, workspace and team." />
      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as "profile" }, replace: true })}>
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="team">Workspace & team</TabsTrigger>
          <TabsTrigger value="system">System status</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="team">
          <TeamTab />
        </TabsContent>
        <TabsContent value="system">
          <SystemTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ProfileTab() {
  const { user } = useMe();
  const update = useUpdateMe();
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState<string | null>(null);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({ name: name.trim() });
      toast.success("Profile updated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (pw.next.length < 8) return setPwError("New password must be at least 8 characters");
    if (pw.next !== pw.confirm) return setPwError("Passwords don't match");
    try {
      await update.mutateAsync({ currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Password changed");
    } catch (err) {
      setPwError((err as Error).message);
    }
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your profile</CardTitle>
          <CardDescription>This name appears on replies, notes and the activity log.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveName} className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email" hint="Contact an admin to change your sign-in email.">
              <Input value={user.email} disabled />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={update.isPending || name.trim().length < 2 || name.trim() === user.name}>
                Save profile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="grid gap-4 sm:grid-cols-3">
            <Field label="Current password">
              <Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </Field>
            <Field label="New password">
              <Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </Field>
            {pwError && <p className="text-sm text-destructive sm:col-span-3">{pwError}</p>}
            <div className="sm:col-span-3">
              <Button type="submit" variant="outline" disabled={update.isPending || !pw.current || !pw.next}>
                Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamTab() {
  const { user, workspace } = useMe();
  const isAdmin = user.role === "admin";
  const users = useQuery(usersQuery);
  const rename = useRenameWorkspace();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const [wsName, setWsName] = useState(workspace.name);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<User | null>(null);
  useEffect(() => setWsName(workspace.name), [workspace.name]);

  return (
    <div className="grid max-w-4xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace</CardTitle>
          <CardDescription>Everything in a workspace — customers, tickets and analytics — is private to its members.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await rename.mutateAsync(wsName.trim());
                toast.success("Workspace renamed");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <div className="flex-1">
              <Field label="Workspace name">
                <Input value={wsName} onChange={(e) => setWsName(e.target.value)} disabled={!isAdmin} />
              </Field>
            </div>
            {isAdmin && (
              <Button type="submit" disabled={rename.isPending || wsName.trim().length < 2 || wsName.trim() === workspace.name}>
                Save
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Team members</CardTitle>
            <CardDescription className="mt-1.5">
              Admins can manage the team and delete records. Agents work tickets and customers.
            </CardDescription>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <UserPlus /> Add member
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden sm:table-cell">Joined</TableHead>
                <TableHead className="w-12 pr-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={u.name} className="size-8" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {u.name} {u.id === user.id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isAdmin && u.id !== user.id ? (
                      <Select
                        value={u.role}
                        onValueChange={async (role) => {
                          try {
                            await updateUser.mutateAsync({ id: u.id, role: role as UserRole });
                            toast.success(`${u.name} is now ${role === "admin" ? "an admin" : "an agent"}`);
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="agent">Agent</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm capitalize">{u.role}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{shortDate(u.createdAt)}</TableCell>
                  <TableCell className="pr-6">
                    {isAdmin && u.id !== user.id && (
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setRemoving(u)} aria-label={`Remove ${u.name}`}>
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AddMemberDialog open={adding} onOpenChange={setAdding} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="They lose access immediately. Tickets assigned to them become unassigned; their notes stay on the tickets."
        confirmLabel="Remove"
        onConfirm={async () => {
          try {
            await deleteUser.mutateAsync(removing!.id);
            toast.success("Member removed");
          } catch (err) {
            toast.error((err as Error).message);
          }
          setRemoving(null);
        }}
      />
    </div>
  );
}

function AddMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateUser();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "agent" as UserRole });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setForm({ name: "", email: "", password: "", role: "agent" });
      setError(null);
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.name.trim().length < 2) return setError("Enter the member's name");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError("Enter a valid email");
    if (form.password.length < 8) return setError("Temporary password must be at least 8 characters");
    try {
      await create.mutateAsync({ ...form, name: form.name.trim(), email: form.email.trim() });
      toast.success(`${form.name.trim()} added`, { description: "Share their sign-in details securely." });
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              Create their account with a temporary password. They can change it under Settings → Profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <Field label="Full name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Temporary password">
              <Input type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Role">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRole })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />} Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusRow({ icon: Icon, label, ok, value, detail }: { icon: typeof Server; label: string; ok: boolean; value: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${ok ? "text-success" : "text-amber-700 dark:text-amber-400"}`}>
        {ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />} {value}
      </span>
    </div>
  );
}

function SystemTab() {
  const { data: h, isLoading } = useQuery({ ...healthQuery, staleTime: 0 });
  if (isLoading || !h) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;
  const pg = h.database.kind === "postgres";
  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Services</CardTitle>
          <CardDescription>Live status of this deployment (v{h.version}).</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <StatusRow icon={Server} label="API" ok={h.status === "ok"} value={h.status === "ok" ? "Operational" : "Degraded"} />
          <StatusRow
            icon={Database}
            label="Database"
            ok={h.database.ok && pg}
            value={pg ? "PostgreSQL" : "Local file store"}
            detail={pg ? "Data is stored durably in Postgres." : "Set DATABASE_URL (e.g. a Neon Postgres URL) so data persists across deploys and serverless instances."}
          />
          <StatusRow
            icon={Sparkles}
            label="AI analysis"
            ok={h.ai.provider === "gemini"}
            value={h.ai.provider === "gemini" ? `Gemini · ${h.ai.model}` : "Rule-based"}
            detail={
              h.ai.provider === "gemini"
                ? "New tickets are categorised, prioritised and summarised by Gemini."
                : "Set GEMINI_API_KEY on the server to switch from keyword rules to Gemini."
            }
          />
        </CardContent>
      </Card>
      {h.warnings.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-base">Configuration notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {h.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SLA policy</CardTitle>
          <CardDescription>Resolution targets measured from ticket creation.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...TICKET_PRIORITIES].reverse().map((p) => (
            <div key={p} className="rounded-lg border p-3">
              <PriorityBadge priority={p} />
              <p className="tabular mt-1 text-xl font-semibold">{SLA_HOURS[p]}h</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
