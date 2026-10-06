import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import type { LivePage } from "./api-types.ts";

// Online score polling, per the design:
//   GET /api/live every 10 s counted from the start of the previous request;
//   a request without an answer for 8 s has failed;
//   hidden tab: no requests; visible again: request at once;
//   last good answer older than 30 s: "stale" (the "Нет связи" banner).

const PERIOD = 10_000;
const TIMEOUT = 8_000;
const STALE = 30_000;

export interface LiveState {
  data: LivePage | null;
  /** No good answer for more than 30 s; data stays on screen. */
  stale: boolean;
  /** The very first request failed and there is nothing to show. */
  failed: boolean;
  retry: () => void;
}

export function useLive(): LiveState {
  const [data, setData] = useState<LivePage | null>(null);
  const [failed, setFailed] = useState(false);
  const [stale, setStale] = useState(false);
  const lastOk = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (document.hidden || inFlight.current) return;
    const started = Date.now();
    inFlight.current = true;
    try {
      const page = await api<LivePage>("/api/live", { timeoutMs: TIMEOUT });
      lastOk.current = Date.now();
      setData(page);
      setFailed(false);
      setStale(false);
    } catch {
      if (!lastOk.current) setFailed(true);
    } finally {
      inFlight.current = false;
    }
    if (!document.hidden) timer.current = setTimeout(poll, Math.max(0, PERIOD - (Date.now() - started)));
  }, []);

  useEffect(() => {
    void poll();
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    const check = setInterval(() => {
      if (lastOk.current && !document.hidden) setStale(Date.now() - lastOk.current > STALE);
    }, 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(check);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  return { data, stale, failed: failed && !data, retry: () => void poll() };
}
