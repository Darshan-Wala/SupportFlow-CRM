/**
 * Idempotent schema. Runs automatically on first request (and via `npm run db:migrate`).
 * Tables are prefixed with sf_ so they never collide with other apps in the same database.
 * Uses CHECK constraints instead of Postgres enums so values can evolve without migrations.
 */
export const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS sf_workspaces (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  next_ticket_number integer NOT NULL DEFAULT 1001,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sf_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES sf_workspaces(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  role          text NOT NULL DEFAULT 'agent' CHECK (role IN ('admin','agent')),
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sf_customers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES sf_workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  email        text NOT NULL,
  phone      text,
  company    text,
  health     text NOT NULL DEFAULT 'Active' CHECK (health IN ('Active','At Risk','VIP')),
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE TABLE IF NOT EXISTS sf_tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES sf_workspaces(id) ON DELETE CASCADE,
  number            integer NOT NULL,
  subject           text NOT NULL,
  description       text NOT NULL,
  status            text NOT NULL DEFAULT 'Open'
                    CHECK (status IN ('Open','In Progress','Pending','Resolved','Closed')),
  priority          text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Urgent')),
  category          text NOT NULL DEFAULT 'General'
                    CHECK (category IN ('Billing','Technical','Account','Bug','Feature Request','General')),
  channel           text NOT NULL DEFAULT 'Web' CHECK (channel IN ('Email','Chat','Phone','Web')),
  customer_id       uuid NOT NULL REFERENCES sf_customers(id) ON DELETE CASCADE,
  assignee_id       uuid REFERENCES sf_users(id) ON DELETE SET NULL,
  ai                jsonb,
  first_response_at timestamptz,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, number)
);

CREATE INDEX IF NOT EXISTS sf_tickets_workspace_idx   ON sf_tickets (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sf_tickets_status_idx      ON sf_tickets (workspace_id, status);
CREATE INDEX IF NOT EXISTS sf_tickets_customer_idx    ON sf_tickets (customer_id);
CREATE INDEX IF NOT EXISTS sf_tickets_assignee_idx    ON sf_tickets (assignee_id);
CREATE INDEX IF NOT EXISTS sf_customers_workspace_idx ON sf_customers (workspace_id);
CREATE INDEX IF NOT EXISTS sf_users_workspace_idx ON sf_users (workspace_id);

CREATE TABLE IF NOT EXISTS sf_ticket_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES sf_tickets(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES sf_users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body        text NOT NULL,
  internal    boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sf_ticket_notes_ticket_idx ON sf_ticket_notes (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS sf_ticket_activities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid NOT NULL REFERENCES sf_tickets(id) ON DELETE CASCADE,
  actor_name text NOT NULL,
  type       text NOT NULL,
  message    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sf_ticket_activities_ticket_idx ON sf_ticket_activities (ticket_id, created_at);
`;
