import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { readBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

/** バックアップのJSONをダウンロードさせる。管理者のみ。 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
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
