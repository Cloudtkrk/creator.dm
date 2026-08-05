/**
 * creator.dm : TikTok Shop クリエイターDM運用管理ツール
 *
 * PostgreSQL スキーマ。アプリ起動時とシード実行時に冪等に適用される。
 * SQLファイルではなくTSの文字列にしているのは、Vercelの関数バンドルに
 * 確実に同梱させるため（実行時のファイル読み込みが不要になる）。
 */
export const SCHEMA_SQL = `
-- 運用者・管理者
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT    NOT NULL,
  login_id      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'operator',  -- admin | operator
  is_active     INTEGER NOT NULL DEFAULT 1,
  memo          TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL
);

-- 報酬単価（月単位で履歴を持つ。effective_month 以降に適用）
CREATE TABLE IF NOT EXISTS rate_cards (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_month  TEXT    NOT NULL,               -- 'YYYY-MM'
  dm_unit_price    INTEGER NOT NULL DEFAULT 0,     -- DM1件あたり
  reply_unit_price INTEGER NOT NULL DEFAULT 0,     -- 返信1件あたり
  line_bonus       INTEGER NOT NULL DEFAULT 0,     -- LINE登録1件あたり
  meeting_bonus    INTEGER NOT NULL DEFAULT 0,     -- 面談実施1件あたり
  monthly_fixed    INTEGER NOT NULL DEFAULT 0,     -- 月額固定
  UNIQUE(user_id, effective_month)
);

-- 運用しているTikTokアカウント
CREATE TABLE IF NOT EXISTS tiktok_accounts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handle     TEXT    NOT NULL UNIQUE,              -- @なしのアカウントID
  nickname   TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'active',    -- active | paused | banned
  daily_goal INTEGER NOT NULL DEFAULT 0,           -- 1日あたりの送付目標
  memo       TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);

-- 日次のDM送付／返信実績（アカウント×日 で一意）
CREATE TABLE IF NOT EXISTS daily_reports (
  id          SERIAL PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES tiktok_accounts(id) ON DELETE CASCADE,
  report_date TEXT    NOT NULL,                    -- 'YYYY-MM-DD'
  sent_count  INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  memo        TEXT    NOT NULL DEFAULT '',
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TEXT    NOT NULL,
  UNIQUE(account_id, report_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);

-- 送付文章テンプレート（担当者ごとに異なる）
CREATE TABLE IF NOT EXISTS templates (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

-- 文章の変更履歴（誰がいつ何に変えたか）
CREATE TABLE IF NOT EXISTS template_revisions (
  id          SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  body        TEXT    NOT NULL,
  note        TEXT    NOT NULL DEFAULT '',
  changed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_template_revisions ON template_revisions(template_id, version DESC);

-- DMからのリード（返信→LINE登録→面談→成約）
CREATE TABLE IF NOT EXISTS leads (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id     INTEGER REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
  creator_handle TEXT    NOT NULL,
  creator_name   TEXT    NOT NULL DEFAULT '',
  stage          TEXT    NOT NULL DEFAULT 'replied', -- replied | line | meeting | closed | lost
  replied_at     TEXT,
  line_at        TEXT,
  meeting_at     TEXT,
  closed_at      TEXT,
  memo           TEXT    NOT NULL DEFAULT '',
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);

-- 月次報酬の調整（交通費・ペナルティ・特別賞与など）
CREATE TABLE IF NOT EXISTS reward_adjustments (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      TEXT    NOT NULL,                     -- 'YYYY-MM'
  amount     INTEGER NOT NULL,                     -- マイナス可
  reason     TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_adj ON reward_adjustments(user_id, month);

-- 月次報酬の確定／支払状況
CREATE TABLE IF NOT EXISTS reward_statuses (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month        TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'draft',   -- draft | confirmed | paid
  confirmed_at TEXT,
  PRIMARY KEY (user_id, month)
);

-- 全体設定（アラート閾値など）
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** アラート判定の初期値。未設定のキーだけ投入される。 */
export const DEFAULT_SETTINGS: Record<string, string> = {
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
