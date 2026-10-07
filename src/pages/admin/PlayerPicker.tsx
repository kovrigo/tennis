import { type KeyboardEvent, useId, useState } from "react";
import type { AdminPlayerRow } from "../../api-types.ts";
import { fieldProps } from "../../components/form.tsx";

// Player choice in the match form: after two letters a list "Фамилия Имя · город",
// the last item "Новый игрок" opens first name, last name and city fields.

export interface PickedPlayer {
  /** Chosen player; 0 when none or a new one. */
  id: number;
  /** Text in the search box. */
  text: string;
  isNew: boolean;
  firstName: string;
  lastName: string;
  city: string;
}

export const NO_PLAYER: PickedPlayer = { id: 0, text: "", isNew: false, firstName: "", lastName: "", city: "" };

export const playerLabel = (p: { name: string; city: string }) => (p.city ? `${p.name} · ${p.city}` : p.name);

/** Lower case, "ё" as "е", single spaces. */
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

const LIMIT = 8;

export function PlayerPicker({
  name,
  label,
  value,
  players,
  errors,
  onChange,
}: {
  /** "playerA" or "playerB": the input id and the server's field key. */
  name: "playerA" | "playerB";
  label: string;
  value: PickedPlayer;
  players: AdminPlayerRow[];
  errors: Record<string, string>;
  onChange: (p: PickedPlayer) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const newKey = name === "playerA" ? "newA" : "newB";
  const error = errors[name];

  const words = norm(value.text).split(" ").filter(Boolean);
  const searching = value.id === 0 && !value.isNew && norm(value.text).replace(/ /g, "").length >= 2;
  const found = searching
    ? players.filter((p) => {
        const hay = norm(`${p.name} ${p.city}`);
        return words.every((w) => hay.includes(w));
      }).slice(0, LIMIT)
    : [];
  const shown = open && searching;
  // Options: found players, then "Новый игрок".
  const count = found.length + 1;

  const choose = (i: number) => {
    setOpen(false);
    if (i < found.length) {
      const p = found[i];
      onChange({ ...NO_PLAYER, id: p.id, text: playerLabel(p) });
      return;
    }
    // Typed "Морозов Артём" fills the last and first name.
    const [last = "", first = ""] = value.text.trim().split(/\s+/);
    onChange({ ...NO_PLAYER, text: value.text, isNew: true, lastName: last, firstName: first });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!shown) {
      if (e.key === "ArrowDown" && searching) {
        setOpen(true);
        setActive(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") setActive((a) => (a + 1) % count);
    else if (e.key === "ArrowUp") setActive((a) => (a - 1 + count) % count);
    else if (e.key === "Enter") choose(Math.min(active, count - 1));
    else if (e.key === "Escape") setOpen(false);
    else return;
    e.preventDefault();
  };

  const optionId = (i: number) => `${listId}-${i}`;
  const setNew = (key: "firstName" | "lastName" | "city", text: string) => onChange({ ...value, [key]: text });
  const newField = (key: "firstName" | "lastName" | "city", text: string) => {
    const id = `${newKey}.${key}`;
    const err = errors[id];
    return (
      <div className={err ? "field invalid" : "field"}>
        <label htmlFor={id}>{text}</label>
        <input type="text" value={value[key]} onChange={(e) => setNew(key, e.target.value)} {...fieldProps(id, err)} />
        {err && (
          <div className="err" id={`${id}-err`}>
            {err}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="picker">
      <div className={error ? "field invalid" : "field"}>
        <label htmlFor={name}>{label}</label>
        <div className="combo">
          <input
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={shown}
            aria-controls={listId}
            aria-activedescendant={shown ? optionId(Math.min(active, count - 1)) : undefined}
            value={value.text}
            onChange={(e) => {
              onChange({ ...NO_PLAYER, text: e.target.value });
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKey}
            {...fieldProps(name, error)}
          />
          <ul id={listId} role="listbox" aria-label={label} className="combo-list" hidden={!shown}>
            {found.map((p, i) => (
              <li
                key={p.id}
                id={optionId(i)}
                role="option"
                aria-selected={active === i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                {playerLabel(p)}
              </li>
            ))}
            <li
              id={optionId(found.length)}
              role="option"
              aria-selected={active >= found.length}
              className="combo-new"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(found.length)}
            >
              Новый игрок
            </li>
          </ul>
        </div>
        {error && (
          <div className="err" id={`${name}-err`}>
            {error}
          </div>
        )}
      </div>
      {value.isNew && (
        <div className="new-player" role="group" aria-label={`${label}: новый игрок`}>
          <div className="field-row">
            {newField("firstName", "Имя")}
            {newField("lastName", "Фамилия")}
            {newField("city", "Город")}
          </div>
          {errors[newKey] && <div className="err">{errors[newKey]}</div>}
        </div>
      )}
    </div>
  );
}
