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

/** 送付文（初回DM）と、返信をもらったあとに送るトーク文。 */
export type TemplateKind = "dm" | "reply";

export const TEMPLATE_KINDS: { value: TemplateKind; label: string; hint: string }[] =
  [
    {
      value: "dm",
      label: "送付文（初回DM）",
      hint: "クリエイターに最初に送るDMの本文",
    },
    {
      value: "reply",
      label: "返信文（返信後のトーク）",
      hint: "返信をもらったあとに送る、LINEへ誘導するための文面",
    },
  ];

export const TEMPLATE_KIND_LABEL: Record<TemplateKind, string> =
  Object.fromEntries(TEMPLATE_KINDS.map((k) => [k.value, k.label])) as Record<
    TemplateKind,
    string
  >;

export type Template = {
  id: number;
  user_id: number;
  title: string;
  body: string;
  kind: TemplateKind;
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

// "closed"（成約）は運用対象から外したが、過去に登録されたデータが
// 表示できるよう型とラベルだけ残している。新たに設定されることはない。
export type LeadStage =
  | "replied"
  | "guided"
  | "line"
  | "meeting"
  | "closed"
  | "lost";

export const LEAD_STAGES: { value: LeadStage; label: string }[] = [
  { value: "replied", label: "返信あり" },
  { value: "guided", label: "LINE誘導済" },
  { value: "line", label: "LINE登録" },
  { value: "meeting", label: "面談実施" },
  { value: "lost", label: "見送り" },
];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  ...(Object.fromEntries(LEAD_STAGES.map((s) => [s.value, s.label])) as Record<
    LeadStage,
    string
  >),
  closed: "成約",
};

/**
 * ステージは日付から自動的に決まる。手入力のステージと日付が食い違うと
 * 報酬集計（日付ベース）と表示がずれるため、常にここで導出する。
 */
export function deriveStage(v: {
  guidedAt?: string | null;
  lineAt: string | null;
  meetingAt: string | null;
  lost?: boolean;
}): LeadStage {
  if (v.lost) return "lost";
  if (v.meetingAt) return "meeting";
  if (v.lineAt) return "line";
  if (v.guidedAt) return "guided";
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
  /** 作業者が申告したLINE誘導日 */
  line_guided_at: string | null;
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
