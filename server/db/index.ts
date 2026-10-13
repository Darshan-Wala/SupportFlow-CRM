import { join } from "node:path";
import { tmpdir } from "node:os";
import { env } from "../config/env.js";
import { MemoryStore } from "./memory.js";
import { PostgresStore } from "./postgres.js";
import type { Store } from "./types.js";

export type { Store } from "./types.js";

const g = globalThis as unknown as { __sfStore?: Store; __sfStoreReady?: Promise<Store> };

function createStore(): Store {
  if (env.DATABASE_URL) {
    return new PostgresStore(env.DATABASE_URL, { serverless: env.isVercel });
  }
  const file = env.DATA_FILE ?? (env.isVercel ? join(tmpdir(), "supportflow.json") : join(process.cwd(), ".data", "supportflow.json"));
  return new MemoryStore(file);
}

/** Returns the initialised store (schema created on first call). */
export function getStore(): Promise<Store> {
  if (!g.__sfStoreReady) {
    g.__sfStore ??= createStore();
    const store = g.__sfStore;
    g.__sfStoreReady = store
      .init()
      .then(() => store)
      .catch((err) => {
        g.__sfStoreReady = undefined;
        throw err;
      });
  }
  return g.__sfStoreReady;
}
