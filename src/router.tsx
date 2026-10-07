import { type AnchorHTMLAttributes, type MouseEvent, useSyncExternalStore } from "react";

// Small router on history.pushState: links, navigate(), current path and query.

const CHANGE = "app:navigate";

function subscribe(cb: () => void): () => void {
  window.addEventListener("popstate", cb);
  window.addEventListener(CHANGE, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(CHANGE, cb);
  };
}

const snapshot = () => window.location.pathname + window.location.search;

let leaveGuard: (() => boolean) | null = null;
/** The address on screen, to return to when Back is refused. */
let shown = snapshot();

/** A form with unsaved changes asks before an in-site link or Back leaves it. Returns false to stay. */
export function setLeaveGuard(guard: (() => boolean) | null): void {
  leaveGuard = guard;
}

/** Asks the open form, if any; true when the page may be left. */
export function canLeave(): boolean {
  if (leaveGuard && !leaveGuard()) return false;
  leaveGuard = null;
  return true;
}

// Registered before any page subscribes, so a refused Back never re-renders.
window.addEventListener("popstate", (e) => {
  if (!canLeave()) {
    e.stopImmediatePropagation();
    window.history.pushState(null, "", shown);
    return;
  }
  shown = snapshot();
});

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (to === snapshot()) return;
  if (!canLeave()) return;
  if (opts.replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  shown = snapshot();
  window.dispatchEvent(new Event(CHANGE));
  if (!opts.replace) window.scrollTo(0, 0);
}

export interface Location {
  path: string;
  query: URLSearchParams;
}

export function useLocation(): Location {
  const href = useSyncExternalStore(subscribe, snapshot, snapshot);
  const url = new URL(href, "http://x");
  return { path: url.pathname, query: url.searchParams };
}

/** "/tournaments/:id" against "/tournaments/7" → { id: "7" }; no match → null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  // "/" stays "/"; "/news/" matches "/news".
  const a = (path.replace(/\/+$/, "") || "/").split("/");
  const b = pattern.split("/");
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < b.length; i++) {
    if (b[i].startsWith(":")) {
      if (!a[i]) return null;
      try {
        params[b[i].slice(1)] = decodeURIComponent(a[i]);
      } catch {
        return null;
      }
    } else if (a[i] !== b[i]) return null;
  }
  return params;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean };

/** A normal link: modified clicks and new tabs work as usual. */
export function Link({ to, replace, onClick, target, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || target) return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} target={target} onClick={handle} {...rest} />;
}
