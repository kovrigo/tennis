import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { handleApi } from "./api.ts";

const port = Number(process.env.PORT ?? 3000);
const production = process.env.NODE_ENV === "production";
const dist = join(import.meta.dirname, "..", "dist");

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

// Development: Vite serves the React app with hot reload on the same port.
const vite = production
  ? null
  : await (await import("vite")).createServer({ server: { middlewareMode: true }, appType: "spa" });

createServer((req, res) => {
  if (handleApi(req, res)) return;
  if (vite) {
    vite.middlewares(req, res);
    return;
  }
  // Production: files from dist/, anything else falls back to index.html.
  const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
  let file = join(dist, path);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`tennis ${production ? "production" : "dev"} server on http://localhost:${port} (node ${process.version})`);
});
