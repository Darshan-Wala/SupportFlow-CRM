# SupportFlow

**AI-powered customer support CRM and ticket management.** It's a full-stack app: React + TanStack on the frontend, an Express REST API, PostgreSQL (Neon) for storage, and Google Gemini for ticket analysis. It deploys to Vercel as **one project**.

> Built for the Datastraw AI + Tech Internship assessment. It covers the whole flow end to end, from the UI and the REST API to the database, the AI integration and cloud deployment.

There is no seeded or sample data. Every workspace starts empty and fills up with the customers, tickets and teammates its users add.

---

## Features

| Area | What you get |
| --- | --- |
| **Workspaces & auth** | Self-service sign-up creates a private workspace. JWT sessions. Admin and agent roles. Admins add teammates, change roles and remove members. |
| **Tickets** | Create, edit, assign, change status/priority/category/channel. Auto-numbered `TKT-1001…` per workspace. Delete (admin). |
| **AI analysis (Gemini)** | Every new ticket gets a **category**, **priority**, **customer sentiment**, a one-line **summary**, **tags** and a **suggested first reply**. You can preview it before saving, re-run it on demand, and apply the suggestions in one click. |
| **Conversation** | Customer-facing replies and private internal notes, plus a complete audit trail of every change. |
| **SLA tracking** | Resolution targets by priority (Urgent 4h, High 24h, Medium 48h, Low 72h), with *at risk* / *breached* indicators and filters. |
| **Search & filtering** | Full-text search (ID, subject, description, customer, company, tags) and multi-select filters for status, priority, category and channel, plus assignee, SLA and sort. Filters live in the URL so views can be shared. |
| **Bulk actions** | Select many tickets and set their status, priority or assignee, or delete them. Export any filtered view to CSV. |
| **Customers** | Customer profiles with health (Active / At Risk / VIP), notes, open and total ticket counts, and full ticket history. Customers can also be created inline from the ticket form. |
| **Dashboard** | Live queue health: active, unassigned, urgent, SLA-breached, created/resolved in the last 24h, 14-day volume, a "needs attention" list and sentiment. |
| **Analytics** | 7d to 1y ranges: volume trend, first response and resolution times, SLA compliance with period-over-period change, breakdowns by category, priority, channel and sentiment, team performance, and top customers. |
| **UX** | Responsive (mobile to desktop), dark mode, ⌘K command palette, keyboard shortcuts, onboarding checklist, empty and loading states, toasts. |

## Tech stack

- **Frontend:** React 19, TypeScript, TanStack Router (file-based, type-safe search params), TanStack Query, Tailwind CSS v4, shadcn/ui (Radix), Recharts, Vite
- **Backend:** Node.js, Express 5, REST, Zod validation, JWT auth, bcrypt, Helmet, rate limiting
- **Database:** PostgreSQL via `pg`, built for **Neon**. The schema is created automatically. With no database configured, local development falls back to a JSON file store.
- **AI:** Google Gemini (`gemini-2.5-flash` by default) with structured JSON output. Without a key, a built-in rule-based classifier keeps the app usable and is clearly labelled as such.
- **Deployment:** Vercel (static frontend + serverless API) with Neon Postgres. Render is optional via `render.yaml`.

## Architecture

```
Browser ──► Vercel CDN ── /            → dist/ (React SPA)
                       └─ /api/*       → api/index.ts (Vercel Function)
                                           └─ server/app.ts (Express)
                                                ├─ Postgres (Neon)   ← DATABASE_URL
                                                └─ Gemini API        ← GEMINI_API_KEY
```

```
api/index.ts            Vercel serverless entry (wraps the Express app)
server/
  app.ts                Express app: middleware, routes, error handling
  index.ts              Standalone server for local dev / Render
  config/env.ts         Typed environment config
  db/                   Store interface + Postgres and file-store implementations
  routes/               auth, tickets, customers, team, insights (dashboard/analytics/AI)
  services/             ai.ts (Gemini + fallback), analytics.ts, tickets.ts
shared/domain.ts        Types, enums and SLA rules shared by API and UI
src/
  routes/               TanStack file routes (login, register, dashboard, tickets, customers, analytics, settings)
  components/           layout, tickets, customers, charts, shadcn/ui
  lib/                  API client, queries/mutations, auth, formatting
```

---

## Run it locally

Requirements: **Node.js 20+**.

```bash
npm install
cp .env.example .env      # optional: add DATABASE_URL / GEMINI_API_KEY
npm run dev               # API on :5000 and web app on :5173
```

Open http://localhost:5173 and **create a workspace**. You'll be the admin.

- With no `DATABASE_URL`, data is saved to `.data/supportflow.json`.
- To use Postgres locally, set `DATABASE_URL` and restart. The tables (`sf_*`) are created on first request, or you can run `npm run db:migrate`.

Other scripts: `npm run build` (type-check and production build), `npm run typecheck`, `npm run build:server && npm start` (single Node service that serves both the API and the built frontend).

## Deploy to Vercel (with Neon)

1. **Create a Neon database** at https://neon.tech and copy the **pooled** connection string (`postgresql://…-pooler…/neondb?sslmode=require`).
2. **Import the repo** into Vercel. The `vercel.json` already sets the Vite framework, the build command, the `dist` output, the `/api` function and the SPA rewrites, so there's nothing to change.
3. Under **Project → Settings → Environment Variables**, add:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | your Neon pooled URL |
   | `JWT_SECRET` | a long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
   | `GEMINI_API_KEY` | key from https://aistudio.google.com/apikey |
   | `GEMINI_MODEL` | *(optional)* defaults to `gemini-2.5-flash` |
   | `ALLOW_SIGNUP` | *(optional)* `false` to disable public sign-up |

4. **Deploy.** Then open the site, create your workspace, and check **Settings → System status**: it should show PostgreSQL and Gemini as connected.

> Without `DATABASE_URL` the deployment still runs, but on Vercel the file store lives in the function's `/tmp` and resets whenever an instance is recycled. Always set `DATABASE_URL` in production.

### Optional: API on Render

`render.yaml` deploys a single Render web service that serves the API and the frontend together. If you would rather host only the API there and keep the frontend on Vercel, set `VITE_API_URL=https://<render-app>/api` on Vercel and `CORS_ORIGINS=https://<vercel-app>` on Render.

---

## How the AI analysis works

`server/services/ai.ts` sends the subject, description and customer context to Gemini's `generateContent` endpoint with a **response JSON schema**, so the output is always well-formed:

```json
{ "category": "Billing", "priority": "High", "sentiment": "Negative",
  "summary": "Customer was charged twice for the October invoice.",
  "suggestedReply": "Hi Marcus, …", "tags": ["refund", "invoice"], "confidence": 0.92 }
```

- On ticket creation, the AI's category and priority are applied **unless the agent picked them manually**. The full analysis is always stored.
- VIP customers nudge borderline priorities up a level.
- If Gemini is unreachable or returns invalid output (timeout, quota, bad JSON), the request still succeeds by using the rule-based classifier. The UI labels which engine produced each result.

## REST API

All endpoints are under `/api`, return JSON envelopes `{ data }` or `{ data, meta }`, and validation errors look like `{ error: { message, details } }`. Every route except `/health`, `/auth/login` and `/auth/register` needs `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Service, database and AI status |
| POST | `/auth/register` | Create a workspace and its admin user |
| POST | `/auth/login` | Sign in |
| GET / PATCH | `/auth/me` | Current user and workspace / update name or password |
| GET | `/tickets` | List with `search, status, priority, category, channel, assignee (me\|unassigned\|id), customerId, sla, sort, order, page, limit` |
| POST | `/tickets` | Create (`customerId` or inline `customer`); AI triage runs automatically |
| GET / PATCH / DELETE | `/tickets/:id` | `:id` can be the UUID, `TKT-1001` or `1001` |
| POST | `/tickets/:id/notes` | Add a reply (`internal: false`) or internal note |
| POST | `/tickets/:id/analyze` | Re-run AI analysis |
| POST | `/tickets/bulk` | `{ ids, action: "update" \| "delete", patch }` |
| GET | `/tickets/export` | CSV export of the current filters |
| GET / POST | `/customers` | List (`search, health, sort, order, page, limit`) / create |
| GET / PATCH / DELETE | `/customers/:id` | Read / update / delete (admin) |
| GET / POST | `/users` | Team list / add member (admin) |
| PATCH / DELETE | `/users/:id` | Change name or role / remove (admin) |
| PATCH | `/workspace` | Rename workspace (admin) |
| GET | `/dashboard?tzOffset=` | Queue overview |
| GET | `/analytics?days=30&tzOffset=` | Reporting metrics |
| POST | `/ai/analyze` | Preview analysis for a draft ticket |

## Data model

`sf_workspaces` → `sf_users`, `sf_customers` → `sf_tickets` → `sf_ticket_notes`, `sf_ticket_activities`

Every query is scoped by `workspace_id`, so workspaces can never see each other's data. Tables use a `sf_` prefix so they can share a database with other apps, including the earlier Prisma tables.

## Security notes

- Passwords are hashed with bcrypt. Sessions are stateless JWTs that are checked against the database on every request, so removed users lose access immediately.
- Helmet headers, a global API rate limit plus a stricter one on login/sign-up, and a 1 MB JSON body limit.
- Input is validated with Zod and SQL is parameterised. CSV exports are protected against formula injection.
- Admin-only actions: deleting tickets or customers, and managing the team and workspace.
