import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Role } from "../src/api-types.ts";
import { type Db, get, run } from "./db.ts";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_HOURS = 24;
const REFRESH_MS = 60 * 60 * 1000;
export const MAX_FAILS = 5;
export const LOCK_MINUTES = 15;

export interface User {
  id: number;
  role: Role;
  firstName: string;
  lastName: string;
  login: string;
}

// ---------- passwords ----------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

// Unknown logins are hashed against this, so timing does not reveal which logins exist.
const DUMMY = "scrypt:00000000000000000000000000000000:" + "0".repeat(64);

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const [, saltHex, hashHex] = (stored ?? DUMMY).split(":");
  const hash = await scryptAsync(password, Buffer.from(saltHex, "hex"), 32);
  return timingSafeEqual(hash, Buffer.from(hashHex, "hex")) && stored !== undefined;
}

// ---------- sessions ----------

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function createSession(db: Db, userId: number, now = new Date()): string {
  const token = randomBytes(32).toString("base64url");
  run(
    db,
    "INSERT INTO sessions (token_hash, user_id, expires_at, refreshed_at) VALUES (?, ?, ?, ?)",
    tokenHash(token),
    userId,
    new Date(now.getTime() + SESSION_HOURS * 3600_000).toISOString(),
    now.toISOString(),
  );
  return token;
}

/** The session's user, or null. `refreshed` is true when the expiry moved and the cookie must be resent. */
export function readSession(db: Db, token: string | undefined, now = new Date()): { user: User; refreshed: boolean } | null {
  if (!token) return null;
  const row = get<{ user_id: number; expires_at: string; refreshed_at: string }>(
    db,
    "SELECT user_id, expires_at, refreshed_at FROM sessions WHERE token_hash = ?",
    tokenHash(token),
  );
  if (!row) return null;
  if (row.expires_at <= now.toISOString()) {
    run(db, "DELETE FROM sessions WHERE token_hash = ?", tokenHash(token));
    return null;
  }
  const user = get<User>(
    db,
    "SELECT id, role, first_name AS firstName, last_name AS lastName, login FROM users WHERE id = ?",
    row.user_id,
  );
  if (!user) return null;
  let refreshed = false;
  if (now.getTime() - Date.parse(row.refreshed_at) >= REFRESH_MS) {
    run(
      db,
      "UPDATE sessions SET expires_at = ?, refreshed_at = ? WHERE token_hash = ?",
      new Date(now.getTime() + SESSION_HOURS * 3600_000).toISOString(),
      now.toISOString(),
      tokenHash(token),
    );
    refreshed = true;
  }
  return { user, refreshed };
}

export function deleteSession(db: Db, token: string | undefined): void {
  if (token) run(db, "DELETE FROM sessions WHERE token_hash = ?", tokenHash(token));
}

export function sessionCookie(name: string, token: string): string {
  return `${name}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`;
}

export function clearedCookie(name: string): string {
  return `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

// ---------- login limit ----------

/**
 * Five wrong passwords in a row close a login for 15 minutes, existing or not.
 * Kept in memory: a restart clears it.
 */
export class LoginLimiter {
  private fails = new Map<string, { count: number; lockedUntil: number }>();

  /** Minutes left when the login is closed, else 0. */
  lockedMinutes(login: string, now = Date.now()): number {
    const f = this.fails.get(login);
    if (!f || f.lockedUntil <= now) return 0;
    return Math.ceil((f.lockedUntil - now) / 60000);
  }

  failure(login: string, now = Date.now()): void {
    for (const [k, v] of this.fails) if (v.lockedUntil && v.lockedUntil <= now) this.fails.delete(k);
    const f = this.fails.get(login) ?? { count: 0, lockedUntil: 0 };
    f.count++;
    if (f.count >= MAX_FAILS) {
      f.lockedUntil = now + LOCK_MINUTES * 60000;
      f.count = 0;
    }
    this.fails.set(login, f);
  }

  success(login: string): void {
    this.fails.delete(login);
  }
}
