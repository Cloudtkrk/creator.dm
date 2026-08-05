import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { queryOne } from "./db";
import type { User } from "./types";

const COOKIE = "cdm_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14日

function secret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "APP_SECRET が未設定です。.env に十分な長さのランダム文字列を設定してください。",
      );
    }
    return "dev-only-insecure-secret-do-not-use-in-production";
  }
  return s;
}

/* ---------- パスワード（scrypt / 依存パッケージなし） ---------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = crypto.scryptSync(
    password.normalize("NFKC"),
    Buffer.from(saltHex, "hex"),
    expected.length,
  );
  return crypto.timingSafeEqual(expected, actual);
}

/* ---------- セッション（HMAC署名付きCookie） ---------- */

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(userId: number): string {
  const payload = `${userId}.${Date.now() + MAX_AGE * 1000}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function decode(token: string): number | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const payload = Buffer.from(body, "base64url").toString();
  const expected = sign(payload);
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return null;
  }
  const [id, exp] = payload.split(".");
  if (Number(exp) < Date.now()) return null;
  return Number(id) || null;
}

export async function createSession(userId: number) {
  const jar = await cookies();
  jar.set(COOKIE, encode(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** ログイン中のユーザー。未ログインなら null。 */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const id = decode(token);
  if (!id) return null;
  return queryOne<User>(
    "SELECT * FROM users WHERE id = ? AND is_active = 1",
    [id],
  );
}

/** 未ログインなら /login へ飛ばす。 */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** ログイン後の入口。管理者は管理画面、運用者は入力画面。 */
export function homePathFor(user: Pick<User, "role">): string {
  return user.role === "admin" ? "/" : "/my";
}

/** 管理者以外なら運用者用の画面へ送り返す。 */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/my");
  return user;
}

/** 運用者用画面の入口。管理者が開いた場合は管理画面へ戻す。 */
export async function requireOperator(): Promise<User> {
  const user = await requireUser();
  if (user.role === "admin") redirect("/");
  return user;
}

/** 対象ユーザーのデータを見る／編集する権限があるか。 */
export function canAccessUser(actor: User, targetUserId: number): boolean {
  return actor.role === "admin" || actor.id === targetUserId;
}

export function assertCanAccessUser(actor: User, targetUserId: number) {
  if (!canAccessUser(actor, targetUserId)) {
    throw new Error("この操作を行う権限がありません。");
  }
}

/** アカウントIDから所有者を引いて権限チェックする。 */
export async function assertOwnsAccount(actor: User, accountId: number) {
  const row = await queryOne<{ user_id: number }>(
    "SELECT user_id FROM tiktok_accounts WHERE id = ?",
    [accountId],
  );
  if (!row) throw new Error("アカウントが見つかりません。");
  assertCanAccessUser(actor, row.user_id);
}
