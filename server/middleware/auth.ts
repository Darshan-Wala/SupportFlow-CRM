import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { User } from "../../shared/domain.js";
import { env } from "../config/env.js";
import { getStore, type Store } from "../db/index.js";
import { ApiError } from "../lib/errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: User;
      store: Store;
    }
  }
}

interface TokenPayload {
  sub: string;
  ws: string;
}

export function signToken(user: Pick<User, "id" | "workspaceId">) {
  return jwt.sign({ sub: user.id, ws: user.workspaceId } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/** Attaches the store to every request. */
export async function withStore(req: Request, _res: Response, next: NextFunction) {
  req.store = await getStore();
  next();
}

/** Verifies the bearer token and loads the current user (so removed users lose access immediately). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw ApiError.unauthorized();
  let payload: TokenPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET) as TokenPayload;
  } catch {
    throw ApiError.unauthorized("Your session has expired. Please sign in again.");
  }
  const user = await req.store.users.findById(payload.sub);
  if (!user || user.workspaceId !== payload.ws) throw ApiError.unauthorized("Account no longer exists");
  const { passwordHash: _p, ...publicUser } = user;
  req.user = publicUser;
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user.role !== "admin") throw ApiError.forbidden("Only workspace admins can do that");
  next();
}
