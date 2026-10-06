import type { IncomingMessage, ServerResponse } from "node:http";
import type { ErrorCode } from "../src/api-types.ts";

/** A refusal with a code from the closed list and a Russian message for the page. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly extra: Record<string, unknown>;

  constructor(status: number, code: ErrorCode, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const MAX_JSON = 1024 * 1024;

export const fail = {
  validation: (fields: Record<string, string>, message = "Не сохранено: проверьте поля, отмеченные красным") =>
    new ApiError(400, "validation", message, { fields }),
  badRequest: (message = "Неверный запрос") => new ApiError(400, "bad_request", message),
  unauthorized: () => new ApiError(401, "unauthorized", "Вход истёк. Войдите снова"),
  forbidden: () => new ApiError(403, "forbidden", "Нет доступа"),
  notFound: () => new ApiError(404, "not_found", "Такой страницы нет"),
  inUse: (message: string, extra: Record<string, unknown> = {}) => new ApiError(409, "in_use", message, extra),
};

export function securityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

export function sendError(res: ServerResponse, e: ApiError): void {
  sendJson(res, e.status, { error: e.code, message: e.message, ...e.extra });
}

/** Reads the whole body up to `limit` bytes; larger bodies are refused with 413 before reading. */
export async function readBody(req: IncomingMessage, limit: number, tooLarge: string): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? NaN);
  if (declared > limit) throw new ApiError(413, "too_large", tooLarge);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new ApiError(413, "too_large", tooLarge);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Writes accept JSON only: a cross-site page cannot send it without a CORS preflight we never answer. */
export async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = String(req.headers["content-type"] ?? "");
  if (!/^application\/json\b/i.test(type)) throw fail.badRequest("Нужен запрос в формате JSON");
  const body = await readBody(req, MAX_JSON, "Слишком большой запрос");
  try {
    return JSON.parse(body.toString("utf8") || "null");
  } catch {
    throw fail.badRequest("Неверный JSON");
  }
}
