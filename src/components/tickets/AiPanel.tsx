import type { AIAnalysis } from "@shared/domain";
import { Check, Copy, Tag } from "lucide-react";
import { useState } from "react";
import { AiSourceBadge, PriorityBadge, SentimentBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";

export function AiInsights({
  ai,
  onUseReply,
  extra,
}: {
  ai: AIAnalysis;
  onUseReply?: (text: string) => void;
  extra?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <AiSourceBadge ai={ai} />
        <span className="text-xs text-muted-foreground">{Math.round(ai.confidence * 100)}% confidence</span>
      </div>
      <p className="leading-relaxed">{ai.summary}</p>
      <dl className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Category</dt>
          <dd className="mt-1 font-medium">{ai.category}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Priority</dt>
          <dd className="mt-1">
            <PriorityBadge priority={ai.priority} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Sentiment</dt>
          <dd className="mt-1">
            <SentimentBadge sentiment={ai.sentiment} />
          </dd>
        </div>
      </dl>
      {extra}
      {ai.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="size-3.5 text-muted-foreground" />
          {ai.tags.map((t) => (
            <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Suggested reply</p>
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-background p-3 text-[13px] leading-relaxed scrollbar-thin">
          {ai.suggestedReply}
        </div>
        <div className="mt-2 flex gap-2">
          {onUseReply && (
            <Button size="sm" variant="secondary" type="button" onClick={() => onUseReply(ai.suggestedReply)}>
              Use as reply
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(ai.suggestedReply).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
