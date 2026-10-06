import { useApi } from "../../api.ts";
import type { Protocol as Data } from "../../api-types.ts";
import { PageData } from "../../components/states.tsx";
import { dayFull } from "../../format.ts";
import { Shield } from "../../layout/icons.tsx";
import { TEST_NOTE } from "../../layout/Layout.tsx";
import { Link } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import "../../styles/public.css";

const TBD = "уточняется";
const GOING = "ещё идёт";

export function Protocol({ id }: { id?: string }) {
  return (
    <PageData loaded={useApi<Data>(`/api/matches/${encodeURIComponent(id ?? "")}`)}>
      {(p) => <ProtocolView p={p} />}
    </PageData>
  );
}

function ProtocolView({ p }: { p: Data }) {
  useTitle("Протокол матча");
  const running = p.state === "running";
  const notStarted = !p.manual && p.state === "not_started";
  const winner = p.winner ? p[p.winner] : null;

  const details: [string, string][] = [
    ["Турнир", p.tournamentName],
    ["Разряд", p.divisionName || TBD],
    ["Круг", p.round || TBD],
    ["Корт", p.court || TBD],
    ["Дата", dayFull(p.day)],
  ];
  // A manual result has no judge and no times.
  if (!p.manual) {
    details.push(
      ["Судья", p.judges.length ? p.judges.join(", ") : TBD],
      ["Начало", p.startedTime ?? TBD],
      ["Конец", running ? GOING : (p.finishedTime ?? TBD)],
      ["Продолжительность", running ? GOING : (p.durationText ?? TBD)],
    );
  }

  return (
    <div className="wrap proto-page">
      <div className="proto-acts">
        <Link className="go" to={`/tournaments/${p.tournamentId}`}>
          ← К турниру
        </Link>
        <button type="button" className="btn btn-p" onClick={() => window.print()}>
          Распечатать
        </button>
      </div>

      <article className="proto">
        <header className="proto-h">
          <Shield />
          <div>
            <p className="proto-org">Ленинградская областная федерация тенниса</p>
            <h1>Протокол матча</h1>
          </div>
        </header>

        {running && <p className="proto-msg">Матч идёт. Протокол будет полным после окончания</p>}
        {notStarted && <p className="proto-msg">Матч ещё не начат</p>}

        <dl className="pd">
          {details.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <ul className="proto-players">
          {(["a", "b"] as const).map((side) => (
            <li key={side} className={p.winner === side ? "win" : undefined}>
              <Link to={`/players/${p[side].id}`}>{p[side].name}</Link>
              {p[side].city && <span className="muted">{p[side].city}</span>}
            </li>
          ))}
        </ul>

        {!notStarted && (
          <dl className="pd">
            {winner && (
              <div>
                <dt>Победитель</dt>
                <dd>
                  <b>{winner.name}</b>
                </dd>
              </div>
            )}
            {p.setsText && (
              <div>
                <dt>Счёт по сетам</dt>
                <dd className="num">{p.setsText}</dd>
              </div>
            )}
            {p.manual && p.manualNote && (
              <div>
                <dt>Пометка</dt>
                <dd>{p.manualNote}</dd>
              </div>
            )}
          </dl>
        )}
        {p.manual && <p className="proto-msg">Итог внесён вручную</p>}

        {!p.manual && !notStarted && p.progression.length > 0 && (
          <section className="prog" aria-labelledby="prog-h">
            <h2 id="prog-h">Ход матча</h2>
            <p className="muted prog-note">
              Первое число — {p.a.name}, второе — {p.b.name}
            </p>
            {p.progression.map((row) => (
              <div key={row.set} className="prog-row">
                <span className="prog-set">{row.set}-й сет</span>
                <ol className="cells">
                  {row.cells.map((c, i) => (
                    <li key={i} className="num">
                      {c}
                      {row.tiebreak && i === row.cells.length - 1 && <small>{row.tiebreak}</small>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        )}

        <p className="proto-note">{TEST_NOTE}</p>
      </article>
    </div>
  );
}
