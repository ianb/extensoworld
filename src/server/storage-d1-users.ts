import type { D1Database, UserRow } from "./d1-types.js";
import { userRowToRecord } from "./d1-types.js";
import type { UserRecord } from "./storage.js";

export async function findUserByGoogleId(
  db: D1Database,
  googleId: string,
): Promise<UserRecord | null> {
  const row = await db
    .prepare("SELECT * FROM users WHERE google_id = ?")
    .bind(googleId)
    .first<UserRow>();
  return row ? userRowToRecord(row) : null;
}

export async function findUserById(db: D1Database, id: string): Promise<UserRecord | null> {
  const row = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  return row ? userRowToRecord(row) : null;
}

export async function findUserByName(db: D1Database, name: string): Promise<UserRecord | null> {
  const row = await db
    .prepare("SELECT * FROM users WHERE display_name = ?")
    .bind(name)
    .first<UserRow>();
  return row ? userRowToRecord(row) : null;
}

export async function hasAnyUsers(db: D1Database): Promise<boolean> {
  return (await db.prepare("SELECT 1 FROM users LIMIT 1").first<{ 1: number }>()) !== null;
}

export async function createUser(db: D1Database, record: UserRecord): Promise<void> {
  await db
    .prepare(
      "INSERT INTO users (id, display_name, email, google_id, roles, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      record.id,
      record.displayName,
      record.email,
      record.googleId,
      JSON.stringify(record.roles),
      record.createdAt,
      record.lastLoginAt,
    )
    .run();
}

export async function updateLastLogin(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), userId)
    .run();
}
