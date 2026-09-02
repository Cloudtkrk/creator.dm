"use server";

import { redirect } from "next/navigation";
import { createSession, hashPassword, invalidateUser } from "@/lib/auth";
import { exec, queryOne } from "@/lib/db";
import { nowIso } from "@/lib/date";
import { tokenMatches } from "./token";

/**
 * 管理者のログイン情報を思い出せなくなったときの復旧口。
 *
 * パスワードは scrypt でハッシュ化して保存しているため、元の文字列は
 * データベースを見ても分からない。読み出す代わりに入れ直す。
 *
 * 誰でも開けては困るので、Vercel の環境変数 ADMIN_RESET_TOKEN を設定した
 * ときだけ有効になる。復旧が終わったら環境変数を消しておくこと。
 */
export async function resetAdminPassword(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const back = (msg: string, type: "ok" | "err" = "err"): never =>
    redirect(
      `/recover?token=${encodeURIComponent(token)}&msg=${encodeURIComponent(msg)}&t=${type}`,
    );

  if (!tokenMatches(token)) back("合言葉が違います。");

  const loginId = String(fd.get("login_id") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const name = String(fd.get("name") ?? "").trim();

  if (!loginId) back("ログインIDを入力してください。");
  if (!/^[A-Za-z0-9_.-]{3,}$/.test(loginId)) {
    back("ログインIDは半角英数字・記号（_ . -）3文字以上で入力してください。");
  }
  if (password.length < 8) back("パスワードは8文字以上にしてください。");

  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM users WHERE login_id = ?",
    [loginId],
  );

  let id: number;
  if (existing) {
    // 既存のアカウントは、パスワードを入れ直したうえで管理者として有効にする
    await exec(
      "UPDATE users SET password_hash = ?, role = 'admin', is_active = 1 WHERE id = ?",
      [hashPassword(password), existing.id],
    );
    id = existing.id;
  } else {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO users (name, login_id, password_hash, role, is_active, memo, created_at)
       VALUES (?, ?, ?, 'admin', 1, '', ?) RETURNING id`,
      [name || loginId, loginId, hashPassword(password), nowIso()],
    );
    id = row!.id;
  }

  invalidateUser(id);
  await createSession(id);
  redirect("/");
}
