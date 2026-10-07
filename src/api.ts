import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiErrorBody } from "./api-types.ts";

// Every request to /api/*. A failure is an ApiFailure:
//   kind "http"    — the site answered with an error body (body.error is the code);
//   kind "network" — no answer: no connection, timeout, the site restarting.

export class ApiFailure extends Error {
  readonly kind: "http" | "network";
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(kind: "http" | "network", status: number, body: ApiErrorBody | null) {
    super(body?.message ?? kind);
    this.kind = kind;
    this.status = status;
    this.body = body;
  }

  get code(): string | null {
    return this.body?.error ?? null;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Sent as JSON. A File or Blob is sent as the raw body (regulation upload). */
  body?: unknown;
  /** Default 10 s. */
  timeoutMs?: number;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
  const raw = opts.body instanceof Blob;
  let res: Response;
  let data: unknown = null;
  // The timeout covers the body too: a body that stalls after the headers is no answer.
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      headers: opts.body === undefined || raw ? {} : { "content-type": "application/json" },
      body: opts.body === undefined ? undefined : raw ? (opts.body as Blob) : JSON.stringify(opts.body),
      signal: ctrl.signal,
      credentials: "same-origin",
    });
    try {
      data = await res.json();
    } catch (e) {
      if (ctrl.signal.aborted) throw e;
      // A proxy error page or an empty body.
    }
  } catch {
    throw new ApiFailure("network", 0, null);
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return data as T;
  const body = data && typeof data === "object" && "error" in data ? (data as ApiErrorBody) : null;
  // 502/503/504 without our error body: the site is restarting, same as no answer.
  if (!body) throw new ApiFailure("network", res.status, null);
  throw new ApiFailure("http", res.status, body);
}

export interface Loaded<T> {
  data: T | null;
  error: ApiFailure | null;
  /** True only after 0.5 s of waiting, so fast pages do not flash "Загружаем…". */
  slow: boolean;
  reload: () => void;
}

/** GET a page's data; a new path loads again. */
export function useApi<T>(path: string | null): Loaded<T> {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: ApiFailure | null }>({
    path: null,
    data: null,
    error: null,
  });
  const [slow, setSlow] = useState(false);
  const [tick, setTick] = useState(0);
  const current = useRef(path);
  current.current = path;

  useEffect(() => {
    if (path === null) return;
    let alive = true;
    setSlow(false);
    const t = setTimeout(() => alive && setSlow(true), 500);
    api<T>(path).then(
      (data) => alive && setState({ path, data, error: null }),
      (error: ApiFailure) => alive && setState({ path, data: null, error }),
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const fresh = state.path === path;
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, slow: !fresh && slow, reload };
}

/**
 * New UUID v4 for a create request or a judge's tap. Built from getRandomValues:
 * crypto.randomUUID exists only on https and localhost, and a dev site may be opened by plain http.
 */
export function newRequestId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
