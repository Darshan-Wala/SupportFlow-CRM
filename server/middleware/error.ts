import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { ApiError } from "../lib/errors.js";

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: { message: `Route ${req.method} ${req.path} not found` } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const flat = err.flatten();
    const first = Object.entries(flat.fieldErrors)[0];
    res.status(400).json({
      error: {
        message: first ? `${first[0]}: ${first[1]?.[0]}` : (flat.formErrors[0] ?? "Validation failed"),
        details: flat.fieldErrors,
      },
    });
    return;
  }
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { message: err.message, details: err.details } });
    return;
  }
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === "23505") {
    res.status(409).json({ error: { message: "A record with these details already exists" } });
    return;
  }
  if ((err as { type?: string })?.type === "entity.parse.failed") {
    res.status(400).json({ error: { message: "Malformed JSON body" } });
    return;
  }
  console.error("[api] Unhandled error:", err);
  res.status(500).json({
    error: {
      message: env.isProd ? "Something went wrong on our side" : ((err as Error)?.message ?? "Internal error"),
    },
  });
}
