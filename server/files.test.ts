import { rmSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { get } from "./db.ts";
import { type TestApp, PDF, addOrganizer, memoryDb, startApp } from "./testkit.ts";

// Regulation files: S1.4, S7.3.

let app: TestApp;
let org: string;
let tournamentId: number;

const upload = (name: string, body: Buffer, id = tournamentId) =>
  app.call("PUT", `/api/admin/tournaments/${id}/regulation?name=${encodeURIComponent(name)}`, {
    cookie: org,
    body,
    headers: { "content-type": "application/octet-stream" },
  });

beforeAll(async () => {
  const db = memoryDb();
  addOrganizer(db);
  app = await startApp(db);
  org = await app.login("organizer", "tennis-org");
  const r = await app.call("POST", "/api/admin/tournaments", {
    cookie: org,
    body: { name: "Кубок", startDate: "2026-10-01", endDate: "2026-10-03", city: "Тосно", venue: "", kind: "amateur", category: "" },
  });
  tournamentId = (await r.json()).id;
});
afterAll(() => app.close());

describe("upload and download", () => {
  test("a PDF is stored and downloads with its Russian name", async () => {
    const r = await upload("Положение «Кубок» 2026.pdf", PDF);
    expect(r.status).toBe(200);
    const info = await r.json();
    expect(info).toMatchObject({ name: "Положение «Кубок» 2026.pdf", type: "pdf", size: PDF.length });
    const d = await app.call("GET", `/api/files/${info.id}`);
    expect(d.status).toBe(200);
    expect(d.headers.get("content-type")).toBe("application/pdf");
    expect(d.headers.get("x-content-type-options")).toBe("nosniff");
    expect(d.headers.get("content-disposition")).toBe(
      `attachment; filename="regulation.pdf"; filename*=UTF-8''${encodeURIComponent("Положение «Кубок» 2026.pdf")}`,
    );
    expect(Buffer.from(await d.arrayBuffer()).equals(PDF)).toBe(true);
  });

  test("Word files by their first bytes", async () => {
    expect((await upload("a.docx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]))).status).toBe(200);
    expect((await upload("a.doc", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]))).status).toBe(200);
  });

  test("a wrong type, or an extension that does not match the first bytes, is refused", async () => {
    for (const [name, body] of [
      ["a.exe", PDF],
      ["a.pdf", Buffer.from([0x50, 0x4b, 0x03, 0x04])],
      ["a.docx", PDF],
      ["a.pdf", Buffer.alloc(0)],
    ] as const) {
      const r = await upload(name, body);
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe("bad_file_type");
    }
  });

  test("control characters and quotes are removed from the stored name", async () => {
    const info = await (await upload('bad"\u0007name\\.pdf', PDF)).json();
    expect(info.name).toBe("badname.pdf");
  });

  test("a declared size over 20 MB gets 413 before the body is sent", async () => {
    const port = Number(new URL(app.base).port);
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({
        host: "127.0.0.1",
        port,
        method: "PUT",
        path: `/api/admin/tournaments/${tournamentId}/regulation?name=big.pdf`,
        headers: { cookie: org, "content-length": String(21 * 1024 * 1024) },
      });
      req.on("response", (res) => resolve(res.statusCode ?? 0));
      req.on("error", reject);
      req.flushHeaders(); // headers only; the body never follows
    });
    expect(status).toBe(413);
  });

  test("a file missing on disk is 404; the tournament page still opens", async () => {
    const info = await (await upload("gone.pdf", PDF)).json();
    rmSync(join(app.filesDir, info.id));
    expect((await app.call("GET", `/api/files/${info.id}`)).status).toBe(404);
    expect((await app.call("GET", `/api/tournaments/${tournamentId}`)).status).toBe(200);
    expect((await app.call("GET", "/api/files/not-an-id")).status).toBe(404);
  });

  test("replacing removes the old file row", async () => {
    const first = await (await upload("one.pdf", PDF)).json();
    await upload("two.pdf", PDF);
    expect(get(app.db, "SELECT 1 AS x FROM files WHERE id = ?", first.id)).toBeUndefined();
  });
});

describe("regulation and points tables", () => {
  test("a points table needs a regulation; the regulation cannot be removed while tables exist", async () => {
    const t = await (
      await app.call("POST", "/api/admin/tournaments", {
        cookie: org,
        body: { name: "Без положения", startDate: "2026-10-01", endDate: "2026-10-01", city: "Луга", venue: "", kind: "amateur", category: "" },
      })
    ).json();
    const g = await (await app.call("POST", "/api/admin/groups", { cookie: org, body: { name: "Мужчины" } })).json();
    const body = { tournamentId: t.id, name: "Мужчины", groupId: g.id, rows: [{ name: "Победитель", points: 10 }] };
    const refused = await app.call("POST", "/api/admin/divisions", { cookie: org, body });
    expect(refused.status).toBe(400);
    expect((await refused.json()).fields.rows).toBe("Таблицу очков можно внести после того, как к турниру приложено положение");

    expect((await upload("p.pdf", PDF, t.id)).status).toBe(200);
    expect((await app.call("POST", "/api/admin/divisions", { cookie: org, body })).status).toBe(200);
    const del = await app.call("DELETE", `/api/admin/tournaments/${t.id}/regulation`, { cookie: org });
    expect(del.status).toBe(409);
    expect((await del.json()).error).toBe("in_use");
  });
});
