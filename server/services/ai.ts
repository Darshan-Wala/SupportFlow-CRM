import { z } from "zod";
import {
  SENTIMENTS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type AIAnalysis,
  type Sentiment,
  type TicketCategory,
  type TicketPriority,
} from "../../shared/domain.js";
import { env } from "../config/env.js";

export interface AnalyzeInput {
  subject: string;
  description: string;
  customerName?: string;
  customerHealth?: string;
}

const aiSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  sentiment: z.enum(SENTIMENTS),
  summary: z.string().min(1).max(400),
  suggestedReply: z.string().min(1).max(3000),
  tags: z.array(z.string()).max(8).default([]),
  confidence: z.number().min(0).max(1).default(0.8),
});

/** Gemini structured-output schema (OpenAPI subset). */
const geminiResponseSchema = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING", enum: [...TICKET_CATEGORIES] },
    priority: { type: "STRING", enum: [...TICKET_PRIORITIES] },
    sentiment: { type: "STRING", enum: [...SENTIMENTS] },
    summary: { type: "STRING" },
    suggestedReply: { type: "STRING" },
    tags: { type: "ARRAY", items: { type: "STRING" } },
    confidence: { type: "NUMBER" },
  },
  required: ["category", "priority", "sentiment", "summary", "suggestedReply", "tags", "confidence"],
  propertyOrdering: [
    "category",
    "priority",
    "sentiment",
    "summary",
    "suggestedReply",
    "tags",
    "confidence",
  ],
};

function buildPrompt(input: AnalyzeInput) {
  return `You are the triage engine of a B2B customer-support CRM. Analyse the ticket below.

Rules:
- category: the single best fit from ${TICKET_CATEGORIES.join(", ")}.
  Billing = invoices, charges, refunds, plans. Technical = how-to / integration / performance problems.
  Account = login, access, permissions, profile, deletion. Bug = something is broken or behaves incorrectly.
  Feature Request = asks for new capability. General = anything else.
- priority, judged on business impact and urgency:
  Urgent = outage, security issue, data loss, many users blocked, or payment failures blocking work.
  High = a core workflow is blocked for the customer or the customer is very upset.
  Medium = degraded experience with a workaround. Low = questions, cosmetic issues, feature ideas.
  ${input.customerHealth === "VIP" ? "The customer is a VIP account: lean one level higher when borderline." : ""}
- sentiment of the customer: Positive, Neutral or Negative.
- summary: one plain sentence (max 160 characters) an agent can scan.
- suggestedReply: a warm, professional first reply to the customer (60-140 words), addressed by first name
  if known, that acknowledges the issue, states the next step, and asks for any missing details.
  Do not promise refunds or timelines you cannot guarantee. Sign off as "The Support Team".
- tags: 2-5 short lowercase keywords.
- confidence: 0..1 for the category/priority decision.

Customer: ${input.customerName ?? "Unknown"}
Subject: ${input.subject}
Description:
"""
${input.description.slice(0, 6000)}
"""`;
}

async function analyzeWithGemini(input: AnalyzeInput): Promise<AIAnalysis> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: geminiResponseSchema,
          },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = aiSchema.parse(JSON.parse(cleaned));
    return {
      ...parsed,
      tags: parsed.tags.map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 5),
      summary: parsed.summary.trim(),
      source: "gemini",
      model: env.GEMINI_MODEL,
      analyzedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Rule-based fallback ──────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<TicketCategory, string[]> = {
  Billing: ["invoice", "billing", "charge", "charged", "refund", "payment", "card", "subscription", "plan", "pricing", "receipt", "tax", "gst", "upgrade", "downgrade"],
  Account: ["login", "log in", "password", "sign in", "signin", "2fa", "mfa", "locked", "access", "permission", "sso", "account", "email change", "delete my", "profile"],
  Bug: ["bug", "error", "broken", "crash", "crashes", "not working", "doesn't work", "does not work", "fails", "failed", "500", "exception", "glitch", "wrong", "incorrect", "missing data"],
  Technical: ["api", "integration", "webhook", "slow", "performance", "timeout", "sync", "export", "import", "configure", "setup", "install", "how do i", "how to", "dns", "ssl"],
  "Feature Request": ["feature", "would be great", "would love", "request", "suggestion", "could you add", "please add", "roadmap", "wish", "enhancement", "ability to"],
  General: [],
};

const URGENT_WORDS = ["outage", "down", "urgent", "asap", "immediately", "critical", "security", "breach", "hacked", "data loss", "all users", "production", "emergency", "cannot access", "can't access"];
const HIGH_WORDS = ["blocked", "blocking", "cannot", "can't", "unable", "charged twice", "double charged", "deadline", "angry", "unacceptable", "escalate", "losing", "not working"];
const LOW_WORDS = ["question", "wondering", "curious", "minor", "typo", "cosmetic", "suggestion", "feature", "would be nice", "when you get a chance"];
const NEGATIVE_WORDS = ["frustrated", "angry", "unacceptable", "terrible", "worst", "disappointed", "annoyed", "ridiculous", "furious", "cancel", "again", "still", "upset", "waste"];
const POSITIVE_WORDS = ["thanks", "thank you", "love", "great", "awesome", "appreciate", "amazing", "happy", "excellent"];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = new Map<string, RegExp>();
/** Whole-word / whole-phrase matches (so "blocked" doesn't match "locked"). */
function countMatches(text: string, words: string[]) {
  return words.filter((w) => {
    let re = wordRe.get(w);
    if (!re) wordRe.set(w, (re = new RegExp(`(^|[^a-z0-9])${escapeRe(w)}($|[^a-z0-9])`, "i")));
    return re.test(text);
  });
}

const REPLY_TEMPLATES: Record<TicketCategory, string> = {
  Billing:
    "Thanks for reaching out about your billing. I've pulled up your account and I'm reviewing the charges you mentioned right now. Could you confirm the invoice number or the last four digits of the card involved? Once I have that, I'll walk you through exactly what happened and the options available to fix it.",
  Account:
    "Thanks for letting us know you're having trouble with your account. Your security matters to us, so I'll help you regain access safely. Could you confirm the email address on the account and roughly when the problem started? In the meantime, please try a password reset from the sign-in page and let me know if the email doesn't arrive.",
  Bug:
    "Thank you for reporting this, and sorry for the disruption. I've flagged it with our engineering team. To help us reproduce it quickly, could you share the steps you took, the browser or device you're using, and a screenshot of any error message? I'll keep you updated as soon as we have more information.",
  Technical:
    "Thanks for getting in touch. I'm happy to help you get this working. Could you share a few more details about your setup (for example the integration or settings you're using) and any error messages you see? With that, I can point you to the right configuration or escalate to our technical team if needed.",
  "Feature Request":
    "Thank you for taking the time to share this idea, we really appreciate it. I've logged your request with our product team, along with your use case so they understand the impact. If you can tell me a bit more about how you'd use this day to day, it'll help them prioritise it.",
  General:
    "Thanks for reaching out to us. I've received your message and I'm looking into it now. If there are any additional details, screenshots or account information you can share, please reply here and I'll make sure this gets resolved as quickly as possible.",
};

export function analyzeHeuristically(input: AnalyzeInput): AIAnalysis {
  const text = `${input.subject}\n${input.description}`.toLowerCase();

  let category: TicketCategory = "General";
  let best = 0;
  const tags = new Set<string>();
  for (const cat of TICKET_CATEGORIES) {
    const hits = countMatches(text, CATEGORY_KEYWORDS[cat]);
    hits.slice(0, 2).forEach((h) => tags.add(h));
    // Subject matches weigh double.
    const score = hits.length + countMatches(input.subject.toLowerCase(), CATEGORY_KEYWORDS[cat]).length;
    if (score > best) {
      best = score;
      category = cat;
    }
  }

  const urgent = countMatches(text, URGENT_WORDS).length;
  const high = countMatches(text, HIGH_WORDS).length;
  const low = countMatches(text, LOW_WORDS).length;
  let priority: TicketPriority = "Medium";
  if (urgent >= 1 && (urgent + high) >= 2) priority = "Urgent";
  else if (urgent >= 1 || high >= 1) priority = "High";
  else if (low >= 1 || category === "Feature Request") priority = "Low";
  if (input.customerHealth === "VIP" && priority === "Medium") priority = "High";

  const neg = countMatches(text, NEGATIVE_WORDS).length + (text.match(/!{2,}/g)?.length ?? 0);
  const pos = countMatches(text, POSITIVE_WORDS).length;
  let sentiment: Sentiment = "Neutral";
  if (neg > pos && neg >= 1) sentiment = "Negative";
  else if (pos > neg) sentiment = "Positive";

  const firstSentence = input.description.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  const summary = (firstSentence.length > 20 ? firstSentence : `${input.subject}: ${firstSentence}`).slice(0, 160);

  const firstName = input.customerName?.split(" ")[0];
  const suggestedReply = `Hi ${firstName || "there"},\n\n${REPLY_TEMPLATES[category]}\n\nBest regards,\nThe Support Team`;

  if (tags.size === 0) tags.add(category.toLowerCase());
  return {
    category,
    priority,
    sentiment,
    summary,
    suggestedReply,
    tags: [...tags].slice(0, 5),
    confidence: Math.min(0.9, 0.45 + best * 0.1),
    source: "heuristic",
    model: null,
    analyzedAt: new Date().toISOString(),
  };
}

export function aiProvider() {
  return env.GEMINI_API_KEY
    ? { provider: "gemini" as const, model: env.GEMINI_MODEL }
    : { provider: "heuristic" as const, model: null };
}

/** Analyse a ticket with Gemini, falling back to the rule-based engine on any failure. */
export async function analyzeTicket(input: AnalyzeInput): Promise<AIAnalysis> {
  if (env.GEMINI_API_KEY) {
    try {
      return await analyzeWithGemini(input);
    } catch (err) {
      console.warn("[ai] Gemini analysis failed, using heuristic fallback:", (err as Error).message);
    }
  }
  return analyzeHeuristically(input);
}
