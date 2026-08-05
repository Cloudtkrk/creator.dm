#!/usr/bin/env node
/**
 * 初期セットアップ用スクリプト。
 *
 *   npm run seed          初期管理者だけを作成
 *   npm run seed:demo     運用イメージを掴むためのデモデータも投入
 *
 * 接続先は DATABASE_URL（または POSTGRES_URL）。
 * 既にユーザーが存在する場合、管理者の作成はスキップされます。
 */
import crypto from "node:crypto";
import pg from "pg";
import { DEFAULT_SETTINGS, SCHEMA_SQL, SCHEMA_VERSION } from "../src/lib/schema.ts";

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

if (!url) {
  console.error(
    "DATABASE_URL が設定されていません。.env に Postgres の接続文字列を書いてください。",
  );
  process.exit(1);
}

pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
const client = new pg.Client({ connectionString: url });
await client.connect();

const q = (sql, params = []) => client.query(sql, params);
const one = async (sql, params) => (await q(sql, params)).rows[0];

await q(SCHEMA_SQL);
for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  await q(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
    [key, value],
  );
}
await q(
  `INSERT INTO settings (key, value) VALUES ('schema_version', $1)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  [SCHEMA_VERSION],
);

const hash = (pw) => {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
};

const nowIso = () => new Date().toISOString();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};

/* ------------------------------------------------------------ 初期管理者 */

const { n } = await one("SELECT COUNT(*) AS n FROM users");
const adminLogin = process.env.SEED_ADMIN_LOGIN_ID || "admin";
const adminPw = process.env.SEED_ADMIN_PASSWORD || "admin1234";

if (n === 0) {
  await q(
    `INSERT INTO users (name, login_id, password_hash, role, is_active, memo, created_at)
     VALUES ($1, $2, $3, 'admin', 1, '', $4)`,
    ["管理者", adminLogin, hash(adminPw), nowIso()],
  );
  console.log(`✔ 初期管理者を作成しました  ID: ${adminLogin} / PW: ${adminPw}`);
  console.log("  ログイン後、必ずパスワードを変更してください。");
} else {
  console.log(`- ユーザーが既に ${n} 件あるため、管理者の作成はスキップしました。`);
}

/* ------------------------------------------------------------ デモデータ */

if (!process.argv.includes("--demo")) {
  console.log("完了。デモデータも入れる場合は npm run seed:demo を実行してください。");
  await client.end();
  process.exit(0);
}

if ((await one("SELECT COUNT(*) AS n FROM tiktok_accounts")).n > 0) {
  console.log("- 既にアカウントが登録されているため、デモデータの投入をスキップしました。");
  await client.end();
  process.exit(0);
}

// 再現性のある擬似乱数（実行のたびに数字が変わらないように）
let seed = 20260805;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (min, max) => min + Math.floor(rnd() * (max - min + 1));

const NAMES = [
  "佐藤 陽菜", "鈴木 大輔", "高橋 美咲", "田中 健太", "伊藤 彩",
  "渡辺 翔", "山本 結衣", "中村 涼太", "小林 真央", "加藤 拓海",
];
const GENRES = ["美容", "コスメ", "food", "ガジェット", "ファッション"];

const body = (name) => `{{creator}}さん
はじめまして、${name}と申します。
TikTok Shopでの商品PRのご案内でご連絡いたしました。

【ご案内内容】
・商品：{{brand}}
・報酬：売上の{{rate}}％
・ご対応：ショート動画1本の投稿

サンプル商品は無償でお送りいたします。
ご興味あればLINEにて詳細をお送りしますので、お気軽にご返信ください。`;

const replyBody = (name) => `ご返信ありがとうございます、${name}です。

詳細のご案内と商品の発送手配をLINEで行っております。
お手数ですが、下記より友だち追加をお願いいたします。

▼LINE
https://lin.ee/xxxxxxx

追加後、「TikTok Shopの件」とだけメッセージをいただければ、
担当より商品詳細と報酬条件をお送りいたします。`;

const month = (offset) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
};

const admin = await one("SELECT id FROM users WHERE role = 'admin' LIMIT 1");

await q("BEGIN");
try {
  for (const [i, name] of NAMES.entries()) {
    const { id: userId } = await one(
      `INSERT INTO users (name, login_id, password_hash, role, is_active, memo, created_at)
       VALUES ($1, $2, $3, 'operator', 1, '', $4) RETURNING id`,
      [name, `op${String(i + 1).padStart(2, "0")}`, hash("password1234"), nowIso()],
    );

    // 単価は人によって異なる（DM 12〜28円 / 一部は固定給やボーナスあり）
    await q(
      `INSERT INTO rate_cards (user_id, effective_month, dm_unit_price, reply_unit_price, line_bonus, meeting_bonus, monthly_fixed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        month(-3),
        between(12, 28),
        i % 3 === 0 ? between(50, 150) : 0,
        i % 2 === 0 ? between(500, 1500) : 0,
        i % 4 === 0 ? between(2000, 5000) : 0,
        i % 5 === 0 ? 30000 : 0,
      ],
    );

    const genre = pick(GENRES);
    for (const [kind, title, text] of [
      ["dm", `${genre}ジャンル向け 初回DM`, body(name.split(" ")[0])],
      ["reply", `${genre}ジャンル向け 返信後トーク`, replyBody(name.split(" ")[0])],
    ]) {
      const { id: tid } = await one(
        `INSERT INTO templates (user_id, title, body, kind, version, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, 1, $5, $5) RETURNING id`,
        [userId, title, text, kind, nowIso()],
      );
      await q(
        `INSERT INTO template_revisions (template_id, version, title, body, note, changed_by, changed_at)
         VALUES ($1, 1, $2, $3, '初版', $4, $5)`,
        [tid, title, text, admin.id, nowIso()],
      );
    }

    // 人によって返信率のベースを変える（アラートの動作確認用に低い人も混ぜる）
    const baseRate = [0.12, 0.09, 0.11, 0.04, 0.15, 0.07, 0.1, 0.03, 0.13, 0.08][i];

    for (let a = 0; a < 5; a++) {
      const status =
        i === 7 && a === 4 ? "banned" : i === 3 && a === 3 ? "paused" : "active";
      const { id: accountId } = await one(
        `INSERT INTO tiktok_accounts (user_id, handle, nickname, status, daily_goal, memo, created_at)
         VALUES ($1, $2, $3, $4, $5, '', $6) RETURNING id`,
        [
          userId,
          `${["beauty", "cosme", "food", "gadget", "fashion"][a]}_dm_${String(i + 1).padStart(2, "0")}`,
          `${GENRES[a]}用`,
          status,
          status === "active" ? 30 : 0,
          nowIso(),
        ],
      );
      if (status !== "active") continue;

      for (let d = 60; d >= 1; d--) {
        const date = daysAgo(d);
        if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue; // 日曜は稼働なし
        const sent = between(18, 38);
        const reply = Math.max(0, Math.round(sent * baseRate * (0.6 + rnd() * 0.9)));
        await q(
          `INSERT INTO daily_reports (account_id, report_date, sent_count, reply_count, memo, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, '', $5, $6)`,
          [accountId, date, sent, reply, admin.id, nowIso()],
        );

        // 返信の一部をリードとして登録
        for (let r = 0; r < reply; r++) {
          if (rnd() > 0.25) continue;
          const toLine = rnd() < 0.45;
          const toMeeting = toLine && rnd() < 0.5;
          const toClosed = toMeeting && rnd() < 0.4;
          const stage = toClosed
            ? "closed"
            : toMeeting
              ? "meeting"
              : toLine
                ? "line"
                : rnd() < 0.15
                  ? "lost"
                  : "replied";
          await q(
            `INSERT INTO leads (user_id, account_id, creator_handle, creator_name, stage,
               replied_at, line_at, meeting_at, closed_at, memo, created_at, updated_at)
             VALUES ($1, $2, $3, '', $4, $5, $6, $7, $8, '', $9, $9)`,
            [
              userId,
              accountId,
              `creator_${i}${a}${d}${r}`,
              stage,
              date,
              toLine ? daysAgo(Math.max(0, d - 1)) : null,
              toMeeting ? daysAgo(Math.max(0, d - 4)) : null,
              toClosed ? daysAgo(Math.max(0, d - 8)) : null,
              nowIso(),
            ],
          );
        }
      }
    }
  }
  await q("COMMIT");
} catch (e) {
  await q("ROLLBACK");
  throw e;
}

const counts = {
  運用者: (await one("SELECT COUNT(*) AS n FROM users WHERE role='operator'")).n,
  アカウント: (await one("SELECT COUNT(*) AS n FROM tiktok_accounts")).n,
  日報: (await one("SELECT COUNT(*) AS n FROM daily_reports")).n,
  リード: (await one("SELECT COUNT(*) AS n FROM leads")).n,
};
console.log("✔ デモデータを投入しました:", counts);
console.log("  運用者のログイン: op01 〜 op10 / パスワード password1234");

await client.end();
