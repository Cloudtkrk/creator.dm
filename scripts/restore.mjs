#!/usr/bin/env node
/**
 * バックアップJSONからデータを復元する。
 *
 *   npm run restore -- backup.json           中身の確認だけ（何も書き換えない）
 *   npm run restore -- backup.json --apply   実際に復元する
 *
 * 現在のデータは全て置き換わります。実行前に必ず今の状態のバックアップを
 * 取ってください（管理画面の「今すぐバックアップ」→ダウンロード）。
 */
import fs from "node:fs";
import pg from "pg";
import { SCHEMA_SQL } from "../src/lib/schema.ts";

const file = process.argv[2];
const apply = process.argv.includes("--apply");

if (!file) {
  console.error("使い方: npm run restore -- <バックアップのJSON> [--apply]");
  process.exit(1);
}

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;
if (!url) {
  console.error("DATABASE_URL が設定されていません。");
  process.exit(1);
}

const dump = JSON.parse(fs.readFileSync(file, "utf8"));
if (!dump?.tables) {
  console.error("バックアップの形式が正しくありません。");
  process.exit(1);
}

// 外部キーの向きに合わせた順序。復元はこの順、削除は逆順。
const ORDER = [
  "users",
  "rate_cards",
  "tiktok_accounts",
  "daily_reports",
  "templates",
  "template_revisions",
  "leads",
  "reward_adjustments",
  "reward_statuses",
  "settings",
];

console.log(`バックアップ日時: ${dump.created_at}`);
for (const t of ORDER) {
  console.log(`  ${t.padEnd(20)} ${(dump.tables[t] ?? []).length} 件`);
}

if (!apply) {
  console.log("\n確認のみで終了しました。実際に復元するには --apply を付けてください。");
  process.exit(0);
}

pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(SCHEMA_SQL);

await client.query("BEGIN");
try {
  for (const t of [...ORDER].reverse()) {
    await client.query(`DELETE FROM ${t}`);
  }

  for (const t of ORDER) {
    const rows = dump.tables[t] ?? [];
    if (rows.length === 0) continue;
    const cols = Object.keys(rows[0]);
    const list = cols.map((c) => `"${c}"`).join(", ");

    // まとめて流し込む（1000件ずつ）
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000);
      const values = [];
      const params = [];
      chunk.forEach((row, n) => {
        values.push(`(${cols.map((_, c) => `$${n * cols.length + c + 1}`).join(", ")})`);
        params.push(...cols.map((c) => row[c]));
      });
      await client.query(
        `INSERT INTO ${t} (${list}) VALUES ${values.join(", ")}`,
        params,
      );
    }

    // SERIAL の採番位置を最大IDに合わせ直す
    if (cols.includes("id")) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${t}', 'id'),
                GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t}), 1))`,
      );
    }
    console.log(`  復元: ${t} ${rows.length} 件`);
  }
  await client.query("COMMIT");
  console.log("\n✔ 復元が完了しました。");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("\n✖ 復元に失敗したため、元の状態に戻しました。");
  throw e;
} finally {
  await client.end();
}
