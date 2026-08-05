#!/usr/bin/env node
/**
 * 初期セットアップ用スクリプト。
 *
 *   node scripts/seed.mjs          初期管理者だけを作成
 *   node scripts/seed.mjs --demo   運用イメージを掴むためのデモデータも投入
 *
 * 既にユーザーが存在する場合、管理者の作成はスキップされます。
 */
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.resolve(root, process.env.DATABASE_PATH || "./data/creator-dm.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(root, "src/lib/schema.sql"), "utf8"));

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

const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get();
const adminLogin = process.env.SEED_ADMIN_LOGIN_ID || "admin";
const adminPw = process.env.SEED_ADMIN_PASSWORD || "admin1234";

if (n === 0) {
  db.prepare(
    `INSERT INTO users (name, login_id, password_hash, role, is_active, memo, created_at)
     VALUES (?, ?, ?, 'admin', 1, '', ?)`,
  ).run("管理者", adminLogin, hash(adminPw), nowIso());
  console.log(`✔ 初期管理者を作成しました  ID: ${adminLogin} / PW: ${adminPw}`);
  console.log("  ログイン後、必ずパスワードを変更してください。");
} else {
  console.log(`- ユーザーが既に ${n} 件あるため、管理者の作成はスキップしました。`);
}

/* ------------------------------------------------------------ デモデータ */

if (!process.argv.includes("--demo")) {
  console.log("完了。デモデータも入れる場合は --demo を付けて再実行してください。");
  process.exit(0);
}

if (db.prepare("SELECT COUNT(*) AS n FROM tiktok_accounts").get().n > 0) {
  console.log("- 既にアカウントが登録されているため、デモデータの投入をスキップしました。");
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

const insUser = db.prepare(
  `INSERT INTO users (name, login_id, password_hash, role, is_active, memo, created_at)
   VALUES (?, ?, ?, 'operator', 1, ?, ?)`,
);
const insRate = db.prepare(
  `INSERT INTO rate_cards (user_id, effective_month, dm_unit_price, reply_unit_price, line_bonus, meeting_bonus, monthly_fixed)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
const insAccount = db.prepare(
  `INSERT INTO tiktok_accounts (user_id, handle, nickname, status, daily_goal, memo, created_at)
   VALUES (?, ?, ?, ?, ?, '', ?)`,
);
const insReport = db.prepare(
  `INSERT INTO daily_reports (account_id, report_date, sent_count, reply_count, memo, updated_by, updated_at)
   VALUES (?, ?, ?, ?, '', ?, ?)`,
);
const insTemplate = db.prepare(
  `INSERT INTO templates (user_id, title, body, version, is_active, created_at, updated_at)
   VALUES (?, ?, ?, 1, 1, ?, ?)`,
);
const insRevision = db.prepare(
  `INSERT INTO template_revisions (template_id, version, title, body, note, changed_by, changed_at)
   VALUES (?, 1, ?, ?, '初版', ?, ?)`,
);
const insLead = db.prepare(
  `INSERT INTO leads (user_id, account_id, creator_handle, creator_name, stage,
     replied_at, line_at, meeting_at, closed_at, memo, created_at, updated_at)
   VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, '', ?, ?)`,
);

const body = (name) => `{{creator}}さん
はじめまして、${name}と申します。
TikTok Shopでの商品PRのご案内でご連絡いたしました。

【ご案内内容】
・商品：{{brand}}
・報酬：売上の{{rate}}％
・ご対応：ショート動画1本の投稿

サンプル商品は無償でお送りいたします。
ご興味あればLINEにて詳細をお送りしますので、お気軽にご返信ください。`;

const month = (offset) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
};

db.transaction(() => {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();

  NAMES.forEach((name, i) => {
    const userId = Number(
      insUser.run(name, `op${String(i + 1).padStart(2, "0")}`, hash("password1234"), "", nowIso())
        .lastInsertRowid,
    );

    // 単価は人によって異なる（DM 12〜28円 / 一部は固定給やボーナスあり）
    insRate.run(
      userId,
      month(-3),
      between(12, 28),
      i % 3 === 0 ? between(50, 150) : 0,
      i % 2 === 0 ? between(500, 1500) : 0,
      i % 4 === 0 ? between(2000, 5000) : 0,
      i % 5 === 0 ? 30000 : 0,
    );

    const tid = Number(
      insTemplate.run(
        userId,
        `${pick(GENRES)}ジャンル向け 初回DM`,
        body(name.split(" ")[0]),
        nowIso(),
        nowIso(),
      ).lastInsertRowid,
    );
    insRevision.run(tid, `${pick(GENRES)}ジャンル向け 初回DM`, body(name.split(" ")[0]), admin.id, nowIso());

    // 人によって返信率のベースを変える（アラートの動作確認用に低い人も混ぜる）
    const baseRate = [0.12, 0.09, 0.11, 0.04, 0.15, 0.07, 0.1, 0.03, 0.13, 0.08][i];

    for (let a = 0; a < 5; a++) {
      const status = i === 7 && a === 4 ? "banned" : i === 3 && a === 3 ? "paused" : "active";
      const accountId = Number(
        insAccount.run(
          userId,
          `${["beauty", "cosme", "food", "gadget", "fashion"][a]}_dm_${String(i + 1).padStart(2, "0")}`,
          `${GENRES[a]}用`,
          status,
          status === "active" ? 30 : 0,
          nowIso(),
        ).lastInsertRowid,
      );
      if (status !== "active") continue;

      for (let d = 60; d >= 1; d--) {
        const date = daysAgo(d);
        const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
        if (dow === 0) continue; // 日曜は稼働なし
        const sent = between(18, 38);
        const reply = Math.max(0, Math.round(sent * baseRate * (0.6 + rnd() * 0.9)));
        insReport.run(accountId, date, sent, reply, admin.id, nowIso());

        // 返信の一部をリードとして登録
        for (let r = 0; r < reply; r++) {
          if (rnd() > 0.25) continue;
          const repliedAt = date;
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
          insLead.run(
            userId,
            accountId,
            `creator_${i}${a}${d}${r}`,
            stage,
            repliedAt,
            toLine ? daysAgo(Math.max(0, d - 1)) : null,
            toMeeting ? daysAgo(Math.max(0, d - 4)) : null,
            toClosed ? daysAgo(Math.max(0, d - 8)) : null,
            nowIso(),
            nowIso(),
          );
        }
      }
    }
  });
})();

const counts = {
  運用者: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='operator'").get().n,
  アカウント: db.prepare("SELECT COUNT(*) AS n FROM tiktok_accounts").get().n,
  日報: db.prepare("SELECT COUNT(*) AS n FROM daily_reports").get().n,
  リード: db.prepare("SELECT COUNT(*) AS n FROM leads").get().n,
};
console.log("✔ デモデータを投入しました:", counts);
console.log("  運用者のログイン: op01 〜 op10 / パスワード password1234");
