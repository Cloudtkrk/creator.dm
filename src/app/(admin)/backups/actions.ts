"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { invalidateUser, requireAdmin } from "@/lib/auth";
import { createBackup, parseDump, restoreFromDump } from "@/lib/backup";

function back(msg: string, type: "ok" | "err" = "ok"): never {
  redirect(`/backups?msg=${encodeURIComponent(msg)}&t=${type}`);
}

export async function backupNow() {
  await requireAdmin();
  const meta = await createBackup("manual");
  revalidatePath("/backups");
  back(`バックアップを作成しました（${(meta.size_bytes / 1024).toFixed(0)}KB）。`);
}

/** 復元は取り返しがつかないため、この語句を打ち込ませて確認する。 */
const CONFIRM_WORD = "復元する";

/**
 * アップロードされたバックアップで全データを置き換える。
 * 別のデータベースへ引っ越すときにも使う（新しいDBに繋ぎ替えてからここで流し込む）。
 */
export async function restoreFromUpload(fd: FormData) {
  await requireAdmin();

  if (String(fd.get("confirm") ?? "").trim() !== CONFIRM_WORD) {
    back(`確認のため「${CONFIRM_WORD}」と入力してください。`, "err");
  }

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    back("バックアップのファイルを選んでください。", "err");
  }

  let restored: Record<string, number>;
  try {
    const dump = parseDump(Buffer.from(await file.arrayBuffer()));
    restored = await restoreFromDump(dump);
  } catch (e) {
    back(
      `復元できませんでした（データは元のままです）：${
        e instanceof Error ? e.message : String(e)
      }`,
      "err",
    );
  }

  // 復元でユーザー行が入れ替わるため、保持していたログイン情報を捨てる
  invalidateUser();
  revalidatePath("/", "layout");
  back(
    `復元しました（日報 ${(restored.daily_reports ?? 0).toLocaleString("ja-JP")}件 / ` +
      `リード ${(restored.leads ?? 0).toLocaleString("ja-JP")}件）。`,
  );
}
