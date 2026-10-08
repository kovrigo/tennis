import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { serveStatic } from "./static.ts";
import { type TestApp, memoryDb, okStatus, startApp, tmpDir } from "./testkit.ts";

// Health, headers, failures of the request handler, static files.

describe("api", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());

  test("health answers ok with commit, migration and seed state", async () => {
    const r = await app.call("GET", "/api/health");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      ok: true,
      commit: "test",
      migration: { latest: "001_init", pending: 0 },
      seed: { latest: "001_samples", pending: 0 },
    });
  });

  test("every answer carries no-store, nosniff and DENY", async () => {
    for (const path of ["/api/health", "/api/home", "/api/nope"]) {
      const r = await app.call("GET", path);
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("x-frame-options")).toBe("DENY");
    }
  });

  test("an unexpected failure is 500 with a plain message, no internals", async () => {
    const db = memoryDb();
    const broken = await startApp(db);
    db.close();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await broken.call("GET", "/api/home");
    quiet.mockRestore();
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "server", message: "Ошибка на сайте. Попробуйте ещё раз." });
    await broken.close();
  });

  test("unknown path is 404 not_found", async () => {
    const r = await app.call("GET", "/api/nope");
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("not_found");
  });

  test("bad URL encoding is 400, the server keeps working", async () => {
    const r = await app.call("GET", "/api/players/%E0%A4%A");
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("bad_request");
    expect((await app.call("GET", "/api/health")).status).toBe(200);
  });

  test("a JSON body over 1 MB is refused with 413", async () => {
    const r = await app.call("POST", "/api/login", { body: { login: "x".repeat(1_100_000), password: "y" } });
    expect(r.status).toBe(413);
  });
});

describe("startup failures", () => {
  test("migration failure: health 503 with the step, every other /api/* not_ready", async () => {
    const status = { ...okStatus(), error: "migration: 002_x: syntax error", fatal: true, migration: { latest: "002_x", pending: 1, drift: [] } };
    const app = await startApp(memoryDb(), status);
    const h = await app.call("GET", "/api/health");
    expect(h.status).toBe(503);
    expect(await h.json()).toMatchObject({ ok: false, error: "migration: 002_x: syntax error", migration: { pending: 1 } });
    const r = await app.call("GET", "/api/home");
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe("not_ready");
    await app.close();
  });

  test("seed failure: health 503, the site keeps answering", async () => {
    const status = { ...okStatus(), error: "seed: 001_samples: boom", seed: { latest: "001_samples", pending: 1 } };
    const app = await startApp(memoryDb(), status);
    expect((await app.call("GET", "/api/health")).status).toBe(503);
    expect((await app.call("GET", "/api/home")).status).toBe(200);
    await app.close();
  });

  test("drift is reported inside migration", async () => {
    const status = { ...okStatus(), migration: { latest: "001_init", pending: 0, drift: ["001_init"] } };
    const app = await startApp(memoryDb(), status);
    expect((await (await app.call("GET", "/api/health")).json()).migration.drift).toEqual(["001_init"]);
    await app.close();
  });
});

describe("static files", () => {
  const dist = tmpDir("dist");
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "index.html"), "<!doctype html>index");
  writeFileSync(join(dist, "assets", "app.js"), "console.log(1)");
  writeFileSync(join(dist, "assets", "league-men.webp"), "RIFF");
  const server = createServer((req, res) => {
    try {
      serveStatic(dist, req, res);
    } catch {
      res.writeHead(400).end();
    }
  });
  let base = "";
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  test("a page path gets index.html, an existing asset is served", async () => {
    expect(await (await fetch(`${base}/tournaments/5`)).text()).toContain("index");
    expect((await fetch(`${base}/assets/app.js`)).headers.get("content-type")).toBe("text/javascript");
  });

  test("a league picture is served as image/webp", async () => {
    expect((await fetch(`${base}/assets/league-men.webp`)).headers.get("content-type")).toBe("image/webp");
  });

  test("a missing asset from an older release is 404, not index.html", async () => {
    expect((await fetch(`${base}/assets/old-123.js`)).status).toBe(404);
  });

  test("path traversal stays inside dist", async () => {
    const body = await new Promise<string>((resolve) => {
      request({ host: "127.0.0.1", port: Number(new URL(base).port), path: "/%2e%2e/package.json" }, (res) => {
        let text = "";
        res.on("data", (c) => (text += c)).on("end", () => resolve(text));
      }).end();
    });
    expect(body).toContain("index");
  });
});
