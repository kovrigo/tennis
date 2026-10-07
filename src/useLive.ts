import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import type { LivePage } from "./api-types.ts";

// Online score polling, per the design:
//   GET /api/live every 10 s counted from the start of the previous request;
//   a request without an answer for 8 s has failed;
//   hidden tab: no requests; visible again: request at once;
//   no good answer for 30 s while the tab is visible: "stale" (the "Нет связи" banner);
//   a request still in flight when the page closes neither updates nor polls again.

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
  // A hidden tab asks nothing, so the 30 s count starts again when it is shown.
  const visibleSince = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(false);

  const poll = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!alive.current || document.hidden || inFlight.current) return;
    const started = Date.now();
    inFlight.current = true;
    try {
      const page = await api<LivePage>("/api/live", { timeoutMs: TIMEOUT });
      if (!alive.current) return;
      lastOk.current = Date.now();
      setData(page);
      setFailed(false);
      setStale(false);
    } catch {
      if (alive.current && !lastOk.current) setFailed(true);
    } finally {
      inFlight.current = false;
    }
    if (alive.current && !document.hidden) timer.current = setTimeout(poll, Math.max(0, PERIOD - (Date.now() - started)));
  }, []);

  useEffect(() => {
    alive.current = true;
    void poll();
    const onVisible = () => {
      if (document.hidden) return;
      visibleSince.current = Date.now();
      void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    const check = setInterval(() => {
      if (lastOk.current && !document.hidden) setStale(Date.now() - Math.max(lastOk.current, visibleSince.current) > STALE);
    }, 1000);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(check);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  return { data, stale, failed: failed && !data, retry: () => void poll() };
}
