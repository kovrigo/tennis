import { useEffect, useState } from "react";

type Health = { ok: boolean; commit: string | null };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth, () => setHealth({ ok: false, commit: null }));
  }, []);

  return (
    <main>
      <h1>Tennis</h1>
      <p>API: {health === null ? "checking…" : health.ok ? "ok" : "unreachable"}</p>
    </main>
  );
}
