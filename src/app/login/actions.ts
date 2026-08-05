"use server";

import { redirect } from "next/navigation";
import { createSession, homePathFor, verifyPassword } from "@/lib/auth";
import { getUserByLoginId } from "@/lib/queries";

export async function login(fd: FormData) {
  const loginId = String(fd.get("login_id") ?? "").trim();
  const password = String(fd.get("password") ?? "");

  const fail = () =>
    redirect(
      `/login?msg=${encodeURIComponent("ログインIDまたはパスワードが違います。")}`,
    );

  if (!loginId || !password) fail();

  const user = await getUserByLoginId(loginId);
  if (!user || !user.is_active) fail();
  if (!verifyPassword(password, user!.password_hash)) fail();

  await createSession(user!.id);
  // 運用者は入力画面、管理者は管理ダッシュボードへ
  redirect(homePathFor(user!));
}
