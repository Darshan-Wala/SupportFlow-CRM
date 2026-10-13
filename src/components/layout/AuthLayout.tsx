import { BarChart3, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

const FEATURES = [
  { icon: Sparkles, title: "AI triage", text: "Gemini reads every ticket and suggests category, priority, sentiment and a first reply." },
  { icon: MessageSquareText, title: "One shared inbox", text: "Assign, reply, add internal notes and track every change in a full audit trail." },
  { icon: BarChart3, title: "Live analytics", text: "SLA compliance, response times and agent performance from your real data." },
  { icon: ShieldCheck, title: "Private workspaces", text: "Every team gets an isolated workspace with role-based access." },
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.24_0.06_264)] p-10 text-white lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(60rem_30rem_at_-10%_-10%,oklch(0.55_0.2_262/.55),transparent_60%),radial-gradient(40rem_30rem_at_110%_110%,oklch(0.52_0.21_277/.5),transparent_60%)]"
        />
        <div className="relative">
          <Logo inverted />
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Customer support that runs itself a little more every day.
          </h2>
          <ul className="mt-8 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <f.icon className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-sm text-white/70">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/50">© {new Date().getFullYear()} SupportFlow</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
