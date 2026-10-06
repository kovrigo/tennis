import { type ReactNode, useEffect, useRef, useState } from "react";
import { ApiFailure, api, newRequestId, useApi } from "../../api.ts";
import type { ActionRequest, JudgeMatch, Side } from "../../api-types.ts";
import { PageData } from "../../components/states.tsx";
import { Link } from "../../router.tsx";
import { useSite, useTitle } from "../../site.tsx";
import "../../styles/judge.css";
import { Games } from "./Games.tsx";
import { Relogin } from "./LoginForm.tsx";

// Scoring screen ("Экраны судьи → Счёт матча"). The board always shows the score
// stored on the site. One action (point or undo) at a time, sent with the seq on screen.
//
//   idle ──tap──► sending ──200──────► idle   new score, "✓ Очко: …"
//                  │  ▲   ──409/403──► idle   score from the refusal (stale: yellow note)
//                  │  │
//                  │  └── "Отправить снова" (same requestId and expectedSeq) ──┐
//                  ├── no answer in 10 s, network, 5xx ──► unsent ─────────────┘
//                  └── 401 ──► login ──► GET match ──► idle   "Последнее действие не сохранилось…"
//
// sending, unsent and login lock all three buttons from the tap (a ref, before re-render).
// Back on the tab while idle: GET the match; another seq shows "Счёт обновлён с сайта".

type Action = { type: "point"; side: Side } | { type: "undo" };

interface Pending {
  action: Action;
  requestId: string;
  expectedSeq: number;
}

type Phase =
  | { kind: "idle" }
  | { kind: "sending"; p: Pending }
  | { kind: "unsent"; p: Pending }
  /** Sign-in expired; lost: an action was refused because of it. */
  | { kind: "login"; lost: boolean };

type Note = { tone: "plain" | "warn" | "error"; text: string } | null;

const FORMAT =
  "Формат: до двух выигранных сетов, тай-брейк до 7 при 6:6 в каждом сете. Итог матча другого формата вносит организатор";
const LOST = "Последнее действие не сохранилось. Проверьте счёт";
const REFRESHED = "Счёт обновлён с сайта";

const other = (s: Side): Side => (s === "a" ? "b" : "a");

/** Sets already won by someone; while running the last set is the current one. */
const doneSets = (m: JudgeMatch) => (m.finished ? m.sets.length : Math.max(0, m.sets.length - 1));

function savedText(action: Action, before: JudgeMatch, after: JudgeMatch, undone: Side | undefined): string {
  if (action.type === "undo") return undone ? `✓ Отменено очко: ${after[undone].name}` : "✓ Очко отменено";
  const done = doneSets(after);
  if (done > doneSets(before)) {
    const s = after.sets[done - 1];
    const w: Side = s.a > s.b ? "a" : "b";
    const l = other(w);
    return `✓ Сет ${done}: ${after[w].name} ${s[w]}:${s[l]}${s.tb ? `(${s.tb[l]})` : ""}`;
  }
  return `✓ Очко: ${after[action.side].name}`;
}

/** Keeps the screen on while the page is visible, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    let alive = true;
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then(
        (l) => {
          if (alive) lock = l;
          else l.release().catch(() => {});
        },
        () => {},
      );
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", request);
      lock?.release().catch(() => {});
    };
  }, []);
}

function Board({ initial }: { initial: JudgeMatch }) {
  const { reload } = useSite();
  const [m, setM] = useState(initial);
  const [phase, setPhaseState] = useState<Phase>({ kind: "idle" });
  const [note, setNote] = useState<Note>(null);
  // Refs read by taps and async answers before React re-renders.
  const phaseRef = useRef<Phase>(phase);
  const shown = useRef(initial);
  // Sides of the points this phone saved since the score was last taken from elsewhere.
  const sides = useRef<Side[]>([]);
  const url = `/api/judge/matches/${initial.id}`;
  useWakeLock();

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const show = (next: JudgeMatch) => {
    shown.current = next;
    setM(next);
  };

  const send = async (p: Pending) => {
    setPhase({ kind: "sending", p });
    setNote(null);
    const before = shown.current;
    const body: ActionRequest =
      p.action.type === "point"
        ? { requestId: p.requestId, type: "point", side: p.action.side, expectedSeq: p.expectedSeq }
        : { requestId: p.requestId, type: "undo", expectedSeq: p.expectedSeq };
    try {
      const res = await api<JudgeMatch>(`${url}/actions`, { method: "POST", body, timeoutMs: 10_000 });
      // A resend answered after other phones acted: the remembered sides no longer apply.
      const fresh = res.seq === p.expectedSeq + 1;
      if (!fresh) sides.current = [];
      let undone: Side | undefined;
      if (p.action.type === "point") {
        if (fresh) sides.current.push(p.action.side);
      } else {
        undone = sides.current.pop();
      }
      setNote({ tone: "plain", text: savedText(p.action, before, res, undone) });
      show(res);
      setPhase({ kind: "idle" });
    } catch (e) {
      if (!(e instanceof ApiFailure) || e.kind === "network" || e.status >= 500) {
        setPhase({ kind: "unsent", p });
        return;
      }
      if (e.status === 401) {
        setPhase({ kind: "login", lost: true });
        return;
      }
      sides.current = [];
      const match = e.body?.match;
      if (match) {
        // stale, finished, nothing_to_undo, undo_closed, manual_result, not_your_match:
        // the board shows the stored score and the screen its state.
        show(match);
        setNote(e.code === "stale" ? { tone: "warn", text: e.message } : null);
      } else {
        setNote({ tone: "error", text: e.message });
      }
      setPhase({ kind: "idle" });
    }
  };

  const tap = (action: Action) => {
    if (phaseRef.current.kind !== "idle") return;
    const p = { action, requestId: newRequestId(), expectedSeq: shown.current.seq };
    phaseRef.current = { kind: "sending", p };
    void send(p);
  };

  const resend = () => {
    const cur = phaseRef.current;
    if (cur.kind !== "unsent") return;
    phaseRef.current = { kind: "sending", p: cur.p };
    void send(cur.p);
  };

  const relogged = async (lost: boolean) => {
    reload();
    const seen = shown.current;
    try {
      const res = await api<JudgeMatch>(url);
      if (res.seq !== seen.seq) sides.current = [];
      show(res);
      setNote(lost ? { tone: "plain", text: LOST } : res.seq !== seen.seq ? { tone: "plain", text: REFRESHED } : null);
      setPhase({ kind: "idle" });
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 401) return;
      // The score could not be checked; the next tap still carries the seq on screen.
      setNote(lost ? { tone: "plain", text: LOST } : null);
      setPhase({ kind: "idle" });
    }
  };

  // Back on the tab: check the stored score unless an action is under way.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || phaseRef.current.kind !== "idle") return;
      const seen = shown.current;
      try {
        const res = await api<JudgeMatch>(url);
        if (phaseRef.current.kind !== "idle" || shown.current !== seen) return;
        if (res.seq !== seen.seq) {
          sides.current = [];
          setNote({ tone: "plain", text: REFRESHED });
        }
        show(res);
      } catch (e) {
        if (e instanceof ApiFailure && e.status === 401 && phaseRef.current.kind === "idle") {
          setPhase({ kind: "login", lost: false });
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [url]);

  const locked = phase.kind !== "idle";

  let message: ReactNode = null;
  if (phase.kind === "sending") {
    const a = phase.p.action;
    message = <span className="j-saving">{a.type === "point" ? `Сохраняем очко: ${m[a.side].name}` : "Сохраняем отмену"}</span>;
  } else if (phase.kind === "unsent") {
    message = (
      <div className="j-unsent">
        <span>Не сохранено: сайт не ответил</span>
        <button type="button" className="j-resend" onClick={resend}>
          Отправить снова
        </button>
      </div>
    );
  } else if (phase.kind === "idle" && note) {
    message = <span className={`j-note j-${note.tone}`}>{note.text}</span>;
  }

  let actions: ReactNode;
  if (phase.kind === "login") {
    actions = <Relogin onDone={() => void relogged(phase.lost)} />;
  } else if (m.manual) {
    actions = <p className="j-off">Организатор внёс итог вручную. Матч больше не ведётся</p>;
  } else if (!m.mine) {
    actions = <p className="j-off">Матч передан другому судье. Отмечать очки больше нельзя</p>;
  } else {
    actions = (
      <>
        {m.finished ? (
          <div className="j-final">
            <p>
              Матч завершён. Победитель: {m.winner ? m[m.winner].name : ""} {m.setsText}
            </p>
            <Link className="btn btn-o" to={`/matches/${m.id}`}>
              Протокол
            </Link>
          </div>
        ) : (
          <div className="j-points">
            {(["a", "b"] as const).map((side) => (
              <button
                key={side}
                type="button"
                className={`j-point j-point-${side}`}
                disabled={locked}
                onClick={() => tap({ type: "point", side })}
              >
                <span className="j-point-l">Очко</span>
                <span className="j-point-n">{m[side].name}</span>
              </button>
            ))}
          </div>
        )}
        {m.undoOpen ? (
          <>
            <button type="button" className="j-undo" disabled={locked} onClick={() => tap({ type: "undo" })}>
              Отменить последнее очко
            </button>
            {m.finished && <p className="j-hint">Отменить последнее очко можно до конца дня</p>}
          </>
        ) : m.finished ? (
          <p className="j-hint j-hint-gap">Исправить итог может организатор</p>
        ) : (
          m.points === 0 && <p className="j-hint j-hint-gap">{FORMAT}</p>
        )}
      </>
    );
  }

  return (
    <div className="j-screen">
      <div className="wrap j-wrap j-scoring">
        <div className="j-head">
          <Link className="j-back" to="/judge">
            <span aria-hidden="true">← </span>Мои матчи
          </Link>
          <h1 className="j-court">{m.court || "корт уточняется"}</h1>
        </div>
        <p className="j-sub">{[m.divisionName, m.round].filter(Boolean).join(" · ")}</p>
        <div className="j-tb">{m.tiebreak && "Тай-брейк"}</div>
        <div className="j-board">
          {(["a", "b"] as const).map((side) => (
            <div key={side} className={m.finished && m.winner === side ? "j-pl win" : "j-pl"}>
              <span className="j-name">{m[side].name}</span>
              <Games sets={m.sets} game={m.game} side={side} running={!m.finished && !m.manual} />
            </div>
          ))}
        </div>
        <div className="j-msg" role="status">
          {message}
        </div>
        {actions}
      </div>
    </div>
  );
}

export function Scoring({ id }: { id?: string }) {
  useTitle("Счёт матча");
  const { reload } = useSite();
  const loaded = useApi<JudgeMatch>(`/api/judge/matches/${encodeURIComponent(id ?? "")}`);
  if (loaded.error?.status === 401) {
    return (
      <div className="j-screen">
        <div className="wrap j-wrap">
          <Relogin
            onDone={() => {
              reload();
              loaded.reload();
            }}
          />
        </div>
      </div>
    );
  }
  return <PageData loaded={loaded}>{(m) => <Board key={m.id} initial={m} />}</PageData>;
}
