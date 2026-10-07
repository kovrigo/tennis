import { useEffect, useState } from "react";
import type { Role } from "../../api-types.ts";
import { navigate, useLocation } from "../../router.tsx";
import { useSite, useTitle } from "../../site.tsx";
import "../../styles/judge.css";
import { LoginForm } from "./LoginForm.tsx";

// Staff login ("Вход"). After it the organizer goes to "Работа организатора", the
// judge to "Мои матчи", or back to the staff page that sent them here (?next=).

const HOME: Record<Role, string> = { organizer: "/admin/tournaments", judge: "/judge" };

/** An in-site path the role may open; another role's area would bounce back here. */
function target(next: string | null, role: Role): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return HOME[role];
  const other = role === "judge" ? "/admin" : "/judge";
  if (next === other || next.startsWith(`${other}/`)) return HOME[role];
  return next;
}

export function Login(_props: { id?: string }) {
  useTitle("Вход");
  const { site, reload } = useSite();
  const { query } = useLocation();
  const next = query.get("next");
  const [done, setDone] = useState<{ role: Role; to: string } | null>(null);

  // Staff pages check the signed-in user from useSite(), so leave only after it has reloaded.
  useEffect(() => {
    if (done && site?.user?.role === done.role) navigate(done.to, { replace: true });
  }, [done, site]);

  return (
    <div className="wrap j-login-page">
      <h1>Вход</h1>
      <div className="j-login-card">
        <LoginForm
          onDone={(res) => {
            setDone({ role: res.role, to: target(next, res.role) });
            reload();
          }}
        />
      </div>
    </div>
  );
}
