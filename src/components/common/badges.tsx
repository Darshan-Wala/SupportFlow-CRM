import type { AIAnalysis, CustomerHealth, Sentiment, SlaInfo, TicketPriority, TicketStatus } from "@shared/domain";
import { AlertTriangle, CheckCircle2, Clock, Frown, Meh, Smile, Sparkles, Timer } from "lucide-react";
import { PRIORITY_STYLES, STATUS_STYLES } from "@/lib/constants";
import { dueIn } from "@/lib/format";
import { cn } from "@/lib/utils";

const pill = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium";

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span className={cn(pill, STATUS_STYLES[status], className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
  const s = PRIORITY_STYLES[priority];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", s.text, className)}>
      <span className={cn("size-2 rounded-[3px]", s.dot)} />
      {priority}
    </span>
  );
}

export function SlaBadge({ sla, compact }: { sla: SlaInfo; compact?: boolean }) {
  if (sla.state === "met")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <CheckCircle2 className="size-3.5" /> {compact ? "Met" : "SLA met"}
      </span>
    );
  if (sla.state === "breached")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-destructive">
        <AlertTriangle className="size-3.5" /> {compact ? "Breached" : dueIn(sla.dueAt)}
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs",
        sla.state === "at_risk" ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground",
      )}
    >
      {sla.state === "at_risk" ? <Timer className="size-3.5" /> : <Clock className="size-3.5" />}
      {dueIn(sla.dueAt)}
    </span>
  );
}

const SENTIMENT = {
  Positive: { icon: Smile, cls: "text-success" },
  Neutral: { icon: Meh, cls: "text-muted-foreground" },
  Negative: { icon: Frown, cls: "text-destructive" },
} as const;

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const s = SENTIMENT[sentiment];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", s.cls)}>
      <s.icon className="size-3.5" /> {sentiment}
    </span>
  );
}

export function HealthBadge({ health }: { health: CustomerHealth }) {
  const cls = {
    Active: "bg-success/10 text-success border-success/25",
    "At Risk": "bg-destructive/10 text-destructive border-destructive/25",
    VIP: "bg-secondary/10 text-secondary border-secondary/25",
  }[health];
  return <span className={cn(pill, cls)}>{health}</span>;
}

export function AiSourceBadge({ ai }: { ai: AIAnalysis }) {
  return (
    <span
      className={cn(
        pill,
        ai.source === "gemini" ? "border-primary/25 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground",
      )}
      title={ai.source === "gemini" ? `Analysed by ${ai.model}` : "Gemini is not configured — rule-based classifier used"}
    >
      <Sparkles className="size-3" />
      {ai.source === "gemini" ? "Gemini" : "Rule-based"}
    </span>
  );
}
