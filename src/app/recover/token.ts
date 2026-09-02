import crypto from "node:crypto";

/**
 * 復旧口の合言葉。Vercel の環境変数 ADMIN_RESET_TOKEN を設定したときだけ
 * /recover が有効になる。短すぎる値は総当たりされるため受け付けない。
 */
export function resetToken(): string | null {
  const t = process.env.ADMIN_RESET_TOKEN;
  return t && t.length >= 16 ? t : null;
}

/** 合言葉の照合。長さの違いも含めて、比較時間から中身が漏れないようにする。 */
export function tokenMatches(given: string | undefined): boolean {
  const expected = resetToken();
  if (!expected || !given) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
