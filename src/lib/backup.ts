import { gunzipSync, gzipSync } from "node:zlib";
import { exec, query, queryOne } from "./db";
import { nowIso } from "./date";

/**
 * バックアップ対象。復元時もこの順に流し込めば外部キーが壊れない。
 * settings と backups 自身は復元対象に含めない（設定は残す／入れ子を避ける）。
 */
const TABLES = [
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
] as const;

/** 何世代残すか。1日1回なので約1か月分。 */
export const KEEP_BACKUPS = 30;

export type BackupMeta = {
  id: number;
  created_at: string;
  kind: string;
  size_bytes: number;
  row_counts: string;
};

export type BackupDump = {
  version: number;
  created_at: string;
  tables: Record<string, unknown[]>;
};

/**
 * 全テーブルを1つのJSONにまとめ、gzip圧縮して保存する。
 * 古いものは KEEP_BACKUPS 世代を超えた分だけ削除する。
 */
export async function createBackup(
  kind: "daily" | "manual" = "daily",
): Promise<BackupMeta> {
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const t of TABLES) {
    const rows = await query<Record<string, unknown>>(`SELECT * FROM ${t}`);
    tables[t] = rows;
    counts[t] = rows.length;
  }

  const dump: BackupDump = { version: 1, created_at: nowIso(), tables };
  const gz = gzipSync(Buffer.from(JSON.stringify(dump)), { level: 9 });

  const row = await queryOne<BackupMeta>(
    `INSERT INTO backups (created_at, kind, size_bytes, row_counts, data)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id, created_at, kind, size_bytes, row_counts`,
    [dump.created_at, kind, gz.length, JSON.stringify(counts), gz],
  );

  await exec(
    `DELETE FROM backups WHERE id NOT IN (
       SELECT id FROM backups ORDER BY created_at DESC, id DESC LIMIT ?
     )`,
    [KEEP_BACKUPS],
  );

  return row!;
}

export function listBackups(): Promise<BackupMeta[]> {
  return query<BackupMeta>(
    `SELECT id, created_at, kind, size_bytes, row_counts
     FROM backups ORDER BY created_at DESC, id DESC`,
  );
}

/** ダウンロード用に、圧縮を解いたJSON文字列を返す。 */
export async function readBackup(id: number): Promise<string | null> {
  const row = await queryOne<{ data: Buffer }>(
    "SELECT data FROM backups WHERE id = ?",
    [id],
  );
  if (!row) return null;
  return gunzipSync(row.data).toString("utf8");
}

/** 直近のバックアップ日時。管理画面で「最終取得」を出すために使う。 */
export async function lastBackupAt(): Promise<string | null> {
  const row = await queryOne<{ created_at: string }>(
    "SELECT created_at FROM backups ORDER BY created_at DESC LIMIT 1",
  );
  return row?.created_at ?? null;
}
