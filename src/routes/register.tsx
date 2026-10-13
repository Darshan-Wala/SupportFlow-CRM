import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/common/misc";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { isAuthenticated, register } from "@/lib/auth";
import { healthQuery } from "@/lib/queries";
import { useTitle } from "@/lib/use-title";

export const Route = createFileRoute("/register")({
  beforeLoad: () => {
    if (isAuthenticated()) throw redirect({ to: "/" });
  },
  component: RegisterPage,
});

function RegisterPage() {
  useTitle("Create workspace");
  const navigate = useNavigate();
  const health = useQuery(healthQuery);
  const [form, setForm] = useState({ name: "", email: "", password: "", workspaceName: "" });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = "Enter your full name";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = "Enter a valid email address";
    if (form.password.length < 8) e.password = "Use at least 8 characters";
    if (form.workspaceName.trim().length < 2) e.workspaceName = "Name your workspace (usually your company)";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!validate()) return;
    setPending(true);
    try {
      await register({ ...form, email: form.email.trim() });
      navigate({ to: "/", replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v?.[0]])));
      }
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const disabled = health.data && !health.data.signupEnabled;

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You'll be the admin. Invite your team from Settings once you're in.
      </p>
      {disabled ? (
        <p className="mt-8 rounded-md border bg-muted/50 p-4 text-sm text-muted-foreground">
          Self-service sign-up is turned off for this deployment. Ask your workspace admin to add you.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <Field label="Full name" htmlFor="name" error={errors.name}>
            <Input id="name" autoComplete="name" autoFocus value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Work email" htmlFor="email" error={errors.email}>
            <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@company.com" />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters">
            <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
          </Field>
          <Field label="Workspace name" htmlFor="workspaceName" error={errors.workspaceName}>
            <Input id="workspaceName" value={form.workspaceName} onChange={set("workspaceName")} placeholder="e.g. Acme Support" />
          </Field>
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Create workspace
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
