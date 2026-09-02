#!/usr/bin/env node
/**
 * 管理者のログインIDを一覧表示し、パスワードを入れ直す。
 *
 *   npm run reset-password                       登録されているIDの一覧だけ表示
 *   npm run reset-password -- admin 新しいパスワード   そのIDのパスワードを設定し直す
 *
 * パスワードは scrypt でハッシュ化して保存しているため、元の文字列は
 * データベースからは取り出せない。読み出す代わりに入れ直す。
 *
 * 画面から行うこともできる（環境変数 ADMIN_RESET_TOKEN を設定して /recover）。
 */
import crypto from "node:crypto";
import pg from "pg";

const [loginId, password] = process.argv.slice(2);

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;
if (!url) {
  console.error("DATABASE_URL が設定されていません。");
  process.exit(1);
}

// src/lib/auth.ts の hashPassword と同じ形式にする
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const { rows } = await client.query(
    "SELECT login_id, name, role, is_active FROM users ORDER BY role, login_id",
  );
  console.log("登録されているアカウント:");
  for (const r of rows) {
    console.log(
      `  ${r.login_id.padEnd(16)} ${r.name}  [${
        r.role === "admin" ? "管理者" : "運用者"
      }${r.is_active ? "" : " / 無効"}]`,
    );
  }
  if (rows.length === 0) console.log("  (まだ誰も登録されていません)");

  if (!loginId || !password) {
    console.log(
      "\nパスワードを設定し直すには:  npm run reset-password -- <ログインID> <新しいパスワード>",
    );
    process.exit(0);
  }
  if (password.length < 8) {
    console.error("\nパスワードは8文字以上にしてください。");
    process.exit(1);
  }

  const res = await client.query(
    "UPDATE users SET password_hash = $1, role = 'admin', is_active = 1 WHERE login_id = $2",
    [hashPassword(password), loginId],
  );
  if (res.rowCount === 0) {
    console.error(`\n「${loginId}」は見つかりませんでした。`);
    process.exit(1);
  }
  console.log(`\n✔ ${loginId} のパスワードを設定し直しました。`);
} finally {
  await client.end();
}
