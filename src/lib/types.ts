export type Role = "admin" | "operator";

export type User = {
  id: number;
  name: string;
  login_id: string;
  password_hash: string;
  role: Role;
  is_active: number;
  memo: string;
  created_at: string;
};

export type RateCard = {
  id: number;
  user_id: number;
  effective_month: string;
  dm_unit_price: number;
  reply_unit_price: number;
  line_bonus: number;
  meeting_bonus: number;
  monthly_fixed: number;
};

export type AccountStatus = "active" | "paused" | "banned";

export type TiktokAccount = {
  id: number;
  user_id: number;
  handle: string;
  nickname: string;
  status: AccountStatus;
  daily_goal: number;
  memo: string;
  created_at: string;
};

export type DailyReport = {
  id: number;
  account_id: number;
  report_date: string;
  sent_count: number;
  reply_count: number;
  memo: string;
  updated_by: number | null;
  updated_at: string;
};

export type Template = {
  id: number;
  user_id: number;
  title: string;
  body: string;
  version: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type TemplateRevision = {
  id: number;
  template_id: number;
  version: number;
  title: string;
  body: string;
  note: string;
  changed_by: number | null;
  changed_at: string;
};

export type LeadStage = "replied" | "line" | "meeting" | "closed" | "lost";

export const LEAD_STAGES: { value: LeadStage; label: string }[] = [
  { value: "replied", label: "返信あり" },
  { value: "line", label: "LINE登録" },
  { value: "meeting", label: "面談実施" },
  { value: "closed", label: "成約" },
  { value: "lost", label: "見送り" },
];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = Object.fromEntries(
  LEAD_STAGES.map((s) => [s.value, s.label]),
) as Record<LeadStage, string>;

/**
 * ステージは日付から自動的に決まる。手入力のステージと日付が食い違うと
 * 報酬集計（日付ベース）と表示がずれるため、常にここで導出する。
 */
export function deriveStage(v: {
  lineAt: string | null;
  meetingAt: string | null;
  closedAt: string | null;
  lost?: boolean;
}): LeadStage {
  if (v.closedAt) return "closed";
  if (v.lost) return "lost";
  if (v.meetingAt) return "meeting";
  if (v.lineAt) return "line";
  return "replied";
}

export type Lead = {
  id: number;
  user_id: number;
  account_id: number | null;
  creator_handle: string;
  creator_name: string;
  stage: LeadStage;
  replied_at: string | null;
  line_at: string | null;
  meeting_at: string | null;
  closed_at: string | null;
  memo: string;
  created_at: string;
  updated_at: string;
};

export type RewardAdjustment = {
  id: number;
  user_id: number;
  month: string;
  amount: number;
  reason: string;
  created_at: string;
};

export type RewardStatusValue = "draft" | "confirmed" | "paid";

export const REWARD_STATUS_LABEL: Record<RewardStatusValue, string> = {
  draft: "未確定",
  confirmed: "確定",
  paid: "支払済",
};

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: "稼働中",
  paused: "停止中",
  banned: "BAN",
};
