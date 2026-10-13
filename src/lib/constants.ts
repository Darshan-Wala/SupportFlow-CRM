import type { TicketPriority, TicketStatus } from "@shared/domain";

export const STATUS_STYLES: Record<TicketStatus, string> = {
  Open: "bg-info/10 text-info border-info/25",
  "In Progress": "bg-primary/10 text-primary border-primary/25",
  Pending: "bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/30",
  Resolved: "bg-success/10 text-success border-success/25",
  Closed: "bg-muted text-muted-foreground border-border",
};

export const PRIORITY_STYLES: Record<TicketPriority, { dot: string; text: string }> = {
  Low: { dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
  Medium: { dot: "bg-info", text: "text-foreground" },
  High: { dot: "bg-warning", text: "text-foreground" },
  Urgent: { dot: "bg-destructive", text: "text-destructive font-semibold" },
};

/** Fixed categorical order for charts (validated palette, see styles.css). */
export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
];

/** Ordinal single-hue ramp for priority (Low → Urgent). */
export const PRIORITY_RAMP = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)"];
