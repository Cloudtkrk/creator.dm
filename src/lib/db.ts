import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_PATH = "./data/creator-dm.db";

let instance: Database.Database | null = null;

function open(): Database.Database {
  // DBファイルは実行時に決まるパスなので、ビルド時のファイルトレースからは除外する。
  const file = path.resolve(
    /*turbopackIgnore: true*/ process.env.DATABASE_PATH || DEFAULT_PATH,
  );
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), {
    recursive: true,
  });

  const db = new Database(/*turbopackIgnore: true*/ file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "schema.sql"),
    "utf8",
  );
  db.exec(schema);
  seedDefaultSettings(db);
  return db;
}

const DEFAULT_SETTINGS: Record<string, string> = {
  // 返信率アラートの閾値（%）。直近 window_days の返信率がこれを下回ると警告。
  alert_reply_rate_warn: "8",
  alert_reply_rate_danger: "5",
  // アラート判定に使う直近日数
  alert_window_days: "7",
  // 判定に必要な最低送付数（母数が小さいと返信率が暴れるため）
  alert_min_sent: "50",
  // 日報の未入力を何日分さかのぼって警告するか
  alert_missing_report_days: "2",
  // LINE転換率（返信→LINE登録）の下限（%）
  alert_line_rate_warn: "20",
};

function seedDefaultSettings(db: Database.Database) {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  );
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) stmt.run(k, v);
  });
  tx();
}

export function getDb(): Database.Database {
  if (!instance) instance = open();
  return instance;
}

export function getSettings(): Record<string, string> {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings")
    .all() as { key: string; value: string }[];
  const out: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function settingNumber(
  settings: Record<string, string>,
  key: string,
): number {
  const n = Number(settings[key]);
  return Number.isFinite(n) ? n : Number(DEFAULT_SETTINGS[key] ?? 0);
}
