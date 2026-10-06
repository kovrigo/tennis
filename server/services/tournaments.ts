import { randomBytes } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FileInfo, FileType, TournamentKind } from "../../src/api-types.ts";
import { type Db, get, run, tx } from "../db.ts";
import { ApiError, fail } from "../http.ts";
import { isDay } from "../time.ts";
import { type Fields, check, createOnce, notFoundUnless, obj, required, str } from "./common.ts";

// Tournaments and their regulation file.

export const MAX_FILE = 20 * 1024 * 1024;

export function saveTournament(db: Db, body: unknown, id?: number): number {
  const b = obj(body);
  const errs: Fields = {};
  const name = required(errs, "name", b.name, "Укажите название");
  const startDate = str(b.startDate, 10);
  const endDate = str(b.endDate, 10);
  const city = required(errs, "city", b.city, "Укажите город", 100);
  const venue = str(b.venue, 200);
  const kind = b.kind === "rtt" || b.kind === "amateur" ? (b.kind as TournamentKind) : null;
  const category = str(b.category, 200);
  if (!isDay(startDate)) errs.startDate = "Укажите дату начала";
  if (!isDay(endDate)) errs.endDate = "Укажите дату окончания";
  else if (isDay(startDate) && endDate < startDate) errs.endDate = "Дата окончания раньше даты начала";
  if (!kind) errs.kind = "Выберите: РТТ или любительский";
  check(errs);

  return tx(db, () => {
    if (id === undefined) {
      return createOnce(db, b.requestId, "tournament", () =>
        run(
          db,
          "INSERT INTO tournaments (name, start_date, end_date, city, venue, kind, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          name,
          startDate,
          endDate,
          city,
          venue,
          kind,
          category,
          new Date().toISOString(),
        ).lastId,
      );
    }
    notFoundUnless(get(db, "SELECT 1 FROM tournaments WHERE id = ?", id));
    const outside = get<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM matches m JOIN divisions d ON d.id = m.division_id WHERE d.tournament_id = ? AND (m.day < ? OR m.day > ?)",
      id,
      startDate,
      endDate,
    )!.n;
    if (outside) throw fail.validation({ endDate: "Есть матчи вне этих дат. Сначала перенесите их" });
    run(
      db,
      "UPDATE tournaments SET name = ?, start_date = ?, end_date = ?, city = ?, venue = ?, kind = ?, category = ? WHERE id = ?",
      name,
      startDate,
      endDate,
      city,
      venue,
      kind,
      category,
      id,
    );
    return id;
  });
}

export function deleteTournament(db: Db, filesDir: string, id: number): void {
  const fileId = tx(db, () => {
    const t = notFoundUnless(get<{ regulation_file_id: string | null }>(db, "SELECT regulation_file_id FROM tournaments WHERE id = ?", id));
    const n = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM matches m JOIN divisions d ON d.id = m.division_id WHERE d.tournament_id = ?", id)!.n;
    if (n) throw fail.inUse("Турнир с матчами удалить нельзя");
    run(db, "DELETE FROM tournaments WHERE id = ?", id);
    if (t.regulation_file_id) run(db, "DELETE FROM files WHERE id = ?", t.regulation_file_id);
    return t.regulation_file_id;
  });
  if (fileId) rmSync(join(filesDir, fileId), { force: true });
}

// ---------- regulation file ----------

const MAGIC: Record<FileType, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  docx: [0x50, 0x4b, 0x03, 0x04], // PK.. (zip)
  doc: [0xd0, 0xcf, 0x11, 0xe0], // OLE compound file
};

export const MIME: Record<FileType, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const badType = () => new ApiError(400, "bad_file_type", "Нужен файл PDF или Word", { fields: { file: "Нужен файл PDF или Word" } });

/** File name for the download header: no control characters, quotes or slashes, at most 200 characters. */
export function cleanFileName(name: string, type: FileType): string {
  const clean = name
    .replace(/[\u0000-\u001f\u007f"\\/]/g, "")
    .trim()
    .slice(0, 200);
  return clean || `regulation.${type}`;
}

export function fileInfo(db: Db, id: string | null): FileInfo | null {
  if (!id) return null;
  const f = get<FileInfo>(db, "SELECT id, name, type, size FROM files WHERE id = ?", id);
  return f ?? null;
}

/** Stores the file, then links it in one transaction. The old file goes only after the commit. */
export function saveRegulation(db: Db, filesDir: string, tournamentId: number, name: string, bytes: Buffer): FileInfo {
  notFoundUnless(get(db, "SELECT 1 FROM tournaments WHERE id = ?", tournamentId));
  const ext = name.toLowerCase().match(/\.(pdf|docx?)$/)?.[1] as FileType | undefined;
  if (!ext || bytes.length < 4 || !MAGIC[ext].every((byte, i) => bytes[i] === byte)) throw badType();
  if (bytes.length > MAX_FILE) throw new ApiError(413, "too_large", "Файл больше 20 МБ");
  const id = randomBytes(16).toString("hex");
  const path = join(filesDir, id);
  writeFileSync(path, bytes);
  let old: string | null;
  try {
    old = tx(db, () => {
      run(db, "INSERT INTO files (id, name, type, size, created_at) VALUES (?, ?, ?, ?, ?)", id, cleanFileName(name, ext), ext, bytes.length, new Date().toISOString());
      const prev = get<{ regulation_file_id: string | null }>(db, "SELECT regulation_file_id FROM tournaments WHERE id = ?", tournamentId)!.regulation_file_id;
      run(db, "UPDATE tournaments SET regulation_file_id = ? WHERE id = ?", id, tournamentId);
      if (prev) run(db, "DELETE FROM files WHERE id = ?", prev);
      return prev;
    });
  } catch (e) {
    rmSync(path, { force: true });
    throw e;
  }
  if (old) rmSync(join(filesDir, old), { force: true });
  return fileInfo(db, id)!;
}

export function deleteRegulation(db: Db, filesDir: string, tournamentId: number): void {
  const old = tx(db, () => {
    const t = notFoundUnless(get<{ regulation_file_id: string | null }>(db, "SELECT regulation_file_id FROM tournaments WHERE id = ?", tournamentId));
    const tables = get<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM points_rows r JOIN divisions d ON d.id = r.division_id WHERE d.tournament_id = ?",
      tournamentId,
    )!.n;
    if (tables) throw fail.inUse("Пока у разрядов есть таблицы очков, положение убрать нельзя");
    run(db, "UPDATE tournaments SET regulation_file_id = NULL WHERE id = ?", tournamentId);
    if (t.regulation_file_id) run(db, "DELETE FROM files WHERE id = ?", t.regulation_file_id);
    return t.regulation_file_id;
  });
  if (old) rmSync(join(filesDir, old), { force: true });
}

export const fileExists = (filesDir: string, id: string) => existsSync(join(filesDir, id));
