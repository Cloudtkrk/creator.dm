import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { readBackup, readBackupGz } from "@/lib/backup";

export const dynamic = "force-dynamic";

/**
 * バックアップをダウンロードさせる。管理者のみ。
 * `?gz=1` を付けると圧縮したまま返す（件数が多いとき、および復元用）。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const gz = new URL(request.url).searchParams.has("gz");

  if (gz) {
    const data = await readBackupGz(Number(id));
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="creator-dm-backup-${id}.json.gz"`,
        "cache-control": "no-store",
      },
    });
  }

  const json = await readBackup(Number(id));
  if (!json) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new NextResponse(json, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="creator-dm-backup-${id}.json"`,
      "cache-control": "no-store",
    },
  });
}
