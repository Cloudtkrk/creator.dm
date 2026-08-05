"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createBackup } from "@/lib/backup";

export async function backupNow() {
  await requireAdmin();
  const meta = await createBackup("manual");
  revalidatePath("/backups");
  redirect(
    `/backups?msg=${encodeURIComponent(
      `バックアップを作成しました（${(meta.size_bytes / 1024).toFixed(0)}KB）。`,
    )}&t=ok`,
  );
}
