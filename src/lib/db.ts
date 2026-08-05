import { cache } from "react";
import { Pool, types, type PoolClient } from "pg";
import { DEFAULT_SETTINGS, SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

/**
 * PostgreSQL 接続。Vercel の Storage 連携（Prisma Postgres / Neon など）が
 * 入れてくれる環境変数をそのまま使う。ローカル開発でも同じ変数を .env に書けば動く。
 */
function connectionString(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL が設定されていません。Vercel では Storage から Postgres を接続し、ローカルでは .env に接続文字列を書いてください。",
    );
  }
  return url;
}

// COUNT() や SUM() は bigint(int8) で返り、pg は既定で文字列にする。
// 件数・金額の集計しか扱わず桁あふれの心配がないため、数値に変換しておく。
types.setTypeParser(types.builtins.INT8, (v) => Number(v));

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionString(),
      // サーバーレスでは1インスタンスあたりの同時実行が少ないため接続数を絞る
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

/**
 * 既存のSQLは `?` プレースホルダで書かれているため、pg の `$1` 形式に変換する。
 * SQL中に `?` を含むリテラルは使っていない。
 */
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/* ------------------------------------------------------------ マイグレーション */

let ready: Promise<void> | undefined;

/**
 * スキーマ適用。複数のサーバーレス関数が同時に起動しても衝突しないよう
 * アドバイザリロックで直列化する。適用済みなら CREATE TABLE IF NOT EXISTS が
 * 何もしないので、毎回呼んでも安全。
 */
async function migrate(): Promise<void> {
  // 適用済みのバージョンを1往復で確認し、最新ならDDLもロックも省く。
  // settings テーブル自体が無い初回はエラーになるので、そのまま適用へ進む。
  const current = await getPool()
    .query("SELECT value FROM settings WHERE key = 'schema_version'")
    .catch(() => null);
  if (current?.rows[0]?.value === SCHEMA_VERSION) return;

  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('creator_dm_schema'))");
    try {
      await client.query(SCHEMA_SQL);
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await client.query(
          "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
          [key, value],
        );
      }
      await client.query(
        `INSERT INTO settings (key, value) VALUES ('schema_version', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [SCHEMA_VERSION],
      );
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('creator_dm_schema'))",
      );
    }
  } finally {
    client.release();
  }
}

/** プロセス内で1度だけスキーマを適用する。 */
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = migrate().catch((e) => {
      ready = undefined; // 失敗したら次のリクエストで再試行する
      throw e;
    });
  }
  return ready;
}

/* ------------------------------------------------------------------ クエリ */

export async function query<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  const r = await getPool().query(toPg(sql), params);
  return r.rows as T[];
}

export async function queryOne<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function exec(sql: string, params: unknown[] = []): Promise<void> {
  await query(sql, params);
}

/** 複数の更新をまとめてコミット／ロールバックする。 */
export async function transaction<T>(
  fn: (tx: {
    query: <R>(sql: string, params?: unknown[]) => Promise<R[]>;
    exec: (sql: string, params?: unknown[]) => Promise<void>;
  }) => Promise<T>,
): Promise<T> {
  await ensureSchema();
  const client: PoolClient = await getPool().connect();
  const api = {
    query: async <R>(sql: string, params: unknown[] = []) =>
      (await client.query(toPg(sql), params)).rows as R[],
    exec: async (sql: string, params: unknown[] = []) => {
      await client.query(toPg(sql), params);
    },
  };
  try {
    await client.query("BEGIN");
    const out = await fn(api);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/* -------------------------------------------------------------- 接続診断 */

export type DbLatency = {
  /** 接続を開くところから最初の応答までにかかった時間 */
  firstMs: number;
  /** 接続済みの状態での1往復（中央値） */
  medianMs: number;
  minMs: number;
  maxMs: number;
  host: string;
};

/**
 * データベースとの往復時間を実測する。画面の待ち時間はほぼ
 * 「往復回数 × これ」で決まるため、表示が遅いときはまずこれを見る。
 */
export async function measureDbLatency(rounds = 7): Promise<DbLatency> {
  const pool = getPool();
  const t0 = Date.now();
  await pool.query("SELECT 1");
  const firstMs = Date.now() - t0;

  const times: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const t = Date.now();
    await pool.query("SELECT 1");
    times.push(Date.now() - t);
  }
  times.sort((a, b) => a - b);

  let host = "-";
  try {
    host = new URL(connectionString()).host;
  } catch {
    /* 接続文字列の形式が想定外でも診断は続ける */
  }

  return {
    firstMs,
    medianMs: times[Math.floor(times.length / 2)],
    minMs: times[0],
    maxMs: times[times.length - 1],
    host,
  };
}

/* ------------------------------------------------------------------ 設定 */

export const getSettings = cache(
  async (): Promise<Record<string, string>> => {
    const rows = await query<{ key: string; value: string }>(
      "SELECT key, value FROM settings",
    );
    const out: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const r of rows) out[r.key] = r.value;
    return out;
  },
);

export async function setSetting(key: string, value: string): Promise<void> {
  await exec(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value],
  );
  // 閾値を変えたらアラートの一時保持を捨てて、次の表示で計算し直す
  const { invalidateAlerts } = await import("./alerts");
  invalidateAlerts();
}

export function settingNumber(
  settings: Record<string, string>,
  key: string,
): number {
  const n = Number(settings[key]);
  return Number.isFinite(n) ? n : Number(DEFAULT_SETTINGS[key] ?? 0);
}
