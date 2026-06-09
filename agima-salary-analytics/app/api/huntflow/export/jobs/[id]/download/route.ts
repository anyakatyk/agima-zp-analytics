import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME, getUserFromPayload } from "@/lib/auth";
import { logAuditEvent } from "@/lib/security/audit-log";
import { getHuntflowExportJobFile } from "@/lib/huntflow-export-jobs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { id } = await context.params;
  const job = getHuntflowExportJobFile(id);
  if (!job) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }
  if (job.status !== "ready" || !job.buffer || !job.fileName) {
    return NextResponse.json({ error: "Файл еще не готов" }, { status: 409 });
  }

  const user = getUserFromPayload(payload);
  logAuditEvent({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: "sync_huntflow",
    details: `Скачан файл фоновой выгрузки Huntflow, job: ${job.id}, ${job.recordCount || 0} записей`,
  });

  return new NextResponse(new Uint8Array(job.buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${job.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
