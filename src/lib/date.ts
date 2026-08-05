/**
 * 日付ユーティリティ。運用は日本国内で行うため、サーバーのTZに関わらず
 * 「今日」は常にJST基準で判定する。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstNow(): Date {
  return new Date(Date.now() + JST_OFFSET_MS);
}

/** 'YYYY-MM-DD'（JST基準の今日） */
export function today(): string {
  return jstNow().toISOString().slice(0, 10);
}

/** 'YYYY-MM'（JST基準の今月） */
export function thisMonth(): string {
  return today().slice(0, 7);
}

/** DB保存用のタイムスタンプ（ISO / UTC） */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 'YYYY-MM-DD' に日数を加算（負数で減算） */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM' に月数を加算 */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}

/** end を含む直近 n 日の日付配列（古い順） */
export function lastNDates(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

/** 月の初日 / 最終日 */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

/** その月の日付をすべて返す */
export function monthDates(month: string): string[] {
  const { start, end } = monthRange(month);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 表示用：'2026-08-05' → '8/5(水)' */
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
export function formatShortDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
}

export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** 表示用：'2026-08' → '2026年8月' */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(new Date(iso).getTime() + JST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 直近12ヶ月分の 'YYYY-MM'（新しい順） */
export function recentMonths(from: string, count = 12): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(from, -i));
}
