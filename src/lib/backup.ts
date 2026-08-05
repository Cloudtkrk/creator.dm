import { gunzipSync, gzipSync } from "node:zlib";
import { exec, query, queryOne, transaction } from "./db";
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

/** 圧縮したまま取り出す。件数が多いときのダウンロード用。 */
export async function readBackupGz(id: number): Promise<Buffer | null> {
  const row = await queryOne<{ data: Buffer }>(
    "SELECT data FROM backups WHERE id = ?",
    [id],
  );
  return row?.data ?? null;
}

/* ------------------------------------------------------------------ 復元 */

/** gzip の magic number。アップロードされたのが .gz か .json かを見分ける。 */
function isGzip(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/** アップロードされたファイル（.json / .json.gz のどちらでも）を読み取る。 */
export function parseDump(buf: Buffer): BackupDump {
  const text = (isGzip(buf) ? gunzipSync(buf) : buf).toString("utf8");
  let dump: unknown;
  try {
    dump = JSON.parse(text);
  } catch {
    throw new Error(
      "ファイルを読み取れませんでした。バックアップ画面からダウンロードしたファイルを選んでください。",
    );
  }
  const d = dump as BackupDump;
  if (!d || typeof d !== "object" || !d.tables) {
    throw new Error("バックアップの形式が正しくありません。");
  }
  for (const t of TABLES) {
    const rows = d.tables[t];
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new Error(`バックアップの ${t} の形式が正しくありません。`);
    }
  }
  return d;
}

export function dumpCounts(dump: BackupDump): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = (dump.tables[t] ?? []).length;
  return out;
}

/**
 * バックアップの内容で全データを置き換える。
 *
 * 1つのトランザクションで行うため、途中で失敗しても元の状態に戻る。
 * 別のデータベースへ引っ越すときにも使う（新しいDBは空のまま復元できる）。
 */
export async function restoreFromDump(
  dump: BackupDump,
): Promise<Record<string, number>> {
  const restored: Record<string, number> = {};

  await transaction(async (tx) => {
    // 外部キーの向きと逆順に消してから、正順で入れ直す
    for (const t of [...TABLES].reverse()) {
      await tx.exec(`DELETE FROM ${t}`);
    }

    for (const t of TABLES) {
      const rows = (dump.tables[t] ?? []) as Record<string, unknown>[];
      restored[t] = rows.length;
      if (rows.length === 0) continue;

      const cols = Object.keys(rows[0]);
      const list = cols.map((c) => `"${c}"`).join(", ");

      // 1件ずつ INSERT すると件数分の往復になるため、1000件ずつまとめる
      for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000);
        const values: string[] = [];
        const params: unknown[] = [];
        chunk.forEach((row, n) => {
          values.push(
            `(${cols.map((_, c) => `$${n * cols.length + c + 1}`).join(", ")})`,
          );
          params.push(...cols.map((c) => row[c]));
        });
        await tx.exec(
          `INSERT INTO ${t} (${list}) VALUES ${values.join(", ")}`,
          params,
        );
      }

      // SERIAL の採番位置を最大IDに合わせ直す（次の登録がIDの衝突で失敗しないように）
      if (cols.includes("id")) {
        await tx.exec(
          `SELECT setval(pg_get_serial_sequence('${t}', 'id'),
                  GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t}), 1))`,
        );
      }
    }
  });

  return restored;
}

/** 直近のバックアップ日時。管理画面で「最終取得」を出すために使う。 */
export async function lastBackupAt(): Promise<string | null> {
  const row = await queryOne<{ created_at: string }>(
    "SELECT created_at FROM backups ORDER BY created_at DESC LIMIT 1",
  );
  return row?.created_at ?? null;
}
