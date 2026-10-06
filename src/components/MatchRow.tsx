import type { MatchRow as Row, SetScore, Side } from "../api-types.ts";
import { dayLong } from "../format.ts";
import { Link } from "../router.tsx";

// The match row of the design ("Строка матча"), used on the home page, the online
// score and the tournament page.

export function whereText(m: { court: string; time: string | null }): string {
  return `${m.court || "корт уточняется"} · ${m.time ?? "время уточняется"}`;
}

export function stateText(m: Row): string {
  if (m.manual) return m.manualNote ? `итог внесён вручную · ${m.manualNote}` : "итог внесён вручную";
  if (m.state === "running") return m.tiebreak ? "идёт · тай-брейк" : `идёт · ${m.setNumber}-й сет`;
  if (m.state === "finished") return "завершён";
  return "не начат";
}

/** Game call for display; "Б" is read out as "больше". */
export function GameCall({ value }: { value: string }) {
  if (value !== "Б") return <>{value}</>;
  return (
    <>
      <span aria-hidden="true">Б</span>
      <span className="sr-only">больше</span>
    </>
  );
}

function SetCells({ m, side }: { m: Row; side: Side }) {
  const other: Side = side === "a" ? "b" : "a";
  if (m.manual && m.sets.length === 0) {
    return <span className="sets num">{m.winner === side && <span className="word">победа</span>}</span>;
  }
  if (!m.manual && m.state === "not_started") {
    return (
      <span className="sets num">
        <span>–</span>
      </span>
    );
  }
  const running = m.state === "running";
  return (
    <span className="sets num">
      {m.sets.map((s: SetScore, i) => {
        const current = running && i === m.sets.length - 1;
        const won = s[side] > s[other];
        const tbLoser = s.tb && s[side] < s[other] ? s.tb[side] : null;
        return (
          <span key={i} className={current ? "cur" : won ? "w" : undefined}>
            {s[side]}
            {tbLoser !== null && <sup>{tbLoser}</sup>}
          </span>
        );
      })}
      {running && m.game && (
        <span className="game">
          <GameCall value={m.game[side]} />
        </span>
      )}
    </span>
  );
}

interface Props {
  m: Row;
  today: string;
  /** Tournament page: the tournament name is not repeated. */
  hideTournament?: boolean;
  /** Tournament page does not refresh itself: a running match links to the online score instead of digits. */
  liveLink?: boolean;
}

export function MatchRow({ m, today, hideTournament, liveLink }: Props) {
  const running = m.state === "running";
  const finished = m.state === "finished";
  const hideScore = liveLink && running;
  const title = [hideTournament ? null : m.tournamentName, m.divisionName, m.round].filter(Boolean).join(" · ");
  let time: string | null = null;
  if (running && m.startedTime) {
    time = m.startedDay && m.startedDay !== today ? `идёт с ${dayLong(m.startedDay)}, ${m.startedTime}` : `идёт с ${m.startedTime}`;
  } else if (finished && !m.manual && m.durationText) {
    time = m.durationText;
  }
  return (
    <article className="match">
      <div className="mh">
        <span className="where">{whereText(m)}</span>
        <span className="rnd">{title}</span>
        <span className="st">
          {running && <span className="live-dot" aria-hidden="true" />}
          {stateText(m)}
        </span>
      </div>
      {(["a", "b"] as const).map((side) => (
        <div key={side} className={finished && m.winner === side ? "pl win" : "pl"}>
          <span className="name">
            <Link to={`/players/${m[side].id}`}>{m[side].name}</Link>
          </span>
          {!hideScore && <SetCells m={m} side={side} />}
        </div>
      ))}
      <div className="mf">
        {hideScore && <Link to="/live">Счёт — в онлайн-счёте</Link>}
        {m.hasProtocol && <Link to={`/matches/${m.id}`}>Протокол</Link>}
        {time && <span className="time">{time}</span>}
      </div>
    </article>
  );
}
