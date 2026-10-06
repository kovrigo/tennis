import { execFileSync } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

function readCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const commit = readCommit();

/** Handles `/api/*`. Returns false for any other path. */
export function handleApi(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith("/api/")) return false;
  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, { ok: true, commit });
  } else {
    sendJson(res, 404, { error: "not_found" });
  }
  return true;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
