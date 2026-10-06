import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api.ts";
import type { SiteInfo } from "./api-types.ts";

// Footer contacts and the signed-in staff member, loaded once per page load.
// Call reload() after login, logout or a contacts change.

interface SiteState {
  site: SiteInfo | null;
  reload: () => void;
}

const SiteContext = createContext<SiteState>({ site: null, reload: () => {} });

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteInfo | null>(null);
  const reload = useCallback(() => {
    api<SiteInfo>("/api/site").then(setSite, () => {});
  }, []);
  useEffect(reload, [reload]);
  return <SiteContext.Provider value={{ site, reload }}>{children}</SiteContext.Provider>;
}

export const useSite = (): SiteState => useContext(SiteContext);

/** Sets the tab title: "Турниры — Федерация тенниса ЛО". */
export function useTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} — Федерация тенниса ЛО` : "Федерация тенниса ЛО";
  }, [title]);
}
