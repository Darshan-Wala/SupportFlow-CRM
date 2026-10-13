// Vercel serverless entry. vercel.json rewrites every /api/* request to this function,
// which hands it to the Express app (the same app `npm run dev:api` serves locally).
import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../server/app.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Depending on the runtime, a rewritten request may arrive as `/api?path=tickets/123`.
  // Restore the original path so Express routing works either way.
  const url = new URL(req.url ?? "/", "http://localhost");
  if ((url.pathname === "/api" || url.pathname === "/api/") && url.searchParams.has("path")) {
    const path = url.searchParams.get("path") ?? "";
    url.searchParams.delete("path");
    const qs = url.searchParams.toString();
    req.url = `/api/${path}${qs ? `?${qs}` : ""}`;
  }
  return app(req as never, res as never);
}
