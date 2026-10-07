import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { pipeline } from "node:stream";

// Production pages from dist/. A missing /assets/ file is 404: a tab from an older
// release must not get index.html as its JavaScript. Any other path gets index.html.

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

/** Throws URIError on a badly encoded path. */
export function serveStatic(dist: string, req: IncomingMessage, res: ServerResponse): void {
  const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
  let file = join(dist, path);
  const missing = !file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory();
  if (missing && path.startsWith("/assets/")) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  if (missing) file = join(dist, "index.html");
  const cache = path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": cache });
  // pipeline closes the file when the browser drops the connection.
  pipeline(createReadStream(file), res, (e) => {
    if (e && (e as NodeJS.ErrnoException).code !== "ERR_STREAM_PREMATURE_CLOSE") console.error(`static ${path}:`, e);
  });
}
