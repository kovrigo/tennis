import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, expect, test } from "vitest";
import { handleApi } from "./api.ts";

const server = createServer((req, res) => {
  if (!handleApi(req, res)) res.writeHead(418).end();
}).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());

test("health answers ok", async () => {
  const r = await fetch(`${base}/api/health`);
  expect(r.status).toBe(200);
  expect((await r.json()).ok).toBe(true);
});

test("unknown api path is 404", async () => {
  expect((await fetch(`${base}/api/nope`)).status).toBe(404);
});
