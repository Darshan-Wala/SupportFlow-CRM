/** Thin fetch wrapper for the SupportFlow REST API. */

const TOKEN_KEY = "sf-token";
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | string[] | null | undefined>;

export function toQueryString(params?: Query) {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 401 && token && !path.startsWith("/auth/login")) {
    setToken(null);
    window.dispatchEvent(new CustomEvent("sf:unauthorized"));
  }
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiError(res.status, json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details);
  }
  if (res.status === 204) return undefined as T;
  if (raw) return (await res.blob()) as T;
  return (await res.json()) as T;
}

/** Unwraps `{ data }` envelopes. */
async function data<T>(method: string, path: string, body?: unknown) {
  return (await request<{ data: T }>(method, path, body)).data;
}

export const api = {
  get: <T>(path: string, params?: Query) => data<T>("GET", path + toQueryString(params)),
  /** For paginated endpoints returning `{ data, meta }`. */
  page: <T>(path: string, params?: Query) => request<T>("GET", path + toQueryString(params)),
  post: <T>(path: string, body?: unknown) => data<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => data<T>("PATCH", path, body),
  delete: (path: string) => request<void>("DELETE", path),
  blob: (path: string, params?: Query) => request<Blob>("GET", path + toQueryString(params), undefined, true),
};
