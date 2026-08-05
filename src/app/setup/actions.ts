"use server";

import { redirect } from "next/navigation";
import { createSession, hashPassword } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { nowIso } from "@/lib/date";

/** 誰も登録されていないときだけ、最初の管理者を作成する。 */
export async function createFirstAdmin(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  const loginId = String(fd.get("login_id") ?? "").trim();
  const password = String(fd.get("password") ?? "");

  const fail = (msg: string) =>
    redirect(`/setup?msg=${encodeURIComponent(msg)}`);

  // 既にユーザーがいる場合は乗っ取り防止のため作成させない
  const { n } = (await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM users",
  )) ?? { n: 0 };
  if (n > 0) redirect("/login");

  if (!name || !loginId) fail("氏名とログインIDを入力してください。");
  if (!/^[A-Za-z0-9_.-]{3,}$/.test(loginId)) {
    fail("ログインIDは半角英数字・記号（_ . -）3文字以上で入力してください。");
  }
  if (password.length < 8) fail("パスワードは8文字以上にしてください。");

  const row = await queryOne<{ id: number }>(
    `INSERT INTO users (name, login_id, password_hash, role, is_active, memo, created_at)
     VALUES (?, ?, ?, 'admin', 1, '', ?) RETURNING id`,
    [name, loginId, hashPassword(password), nowIso()],
  );
  await createSession(row!.id);
  redirect("/");
}
