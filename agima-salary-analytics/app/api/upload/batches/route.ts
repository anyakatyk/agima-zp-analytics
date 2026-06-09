import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME, getUserFromPayload } from "@/lib/auth";
import { canUploadData } from "@/lib/security/access-control";
import { logAuditEvent } from "@/lib/security/audit-log";
import { deleteBatch, getAllBatches } from "@/lib/upload-batches";

// GET — список всех загрузок
export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const batches = getAllBatches();
  return NextResponse.json({ batches });
}

// DELETE — удалить загрузку
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const user = getUserFromPayload(payload);

  if (!canUploadData(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const batchId = searchParams.get("id");

  if (!batchId) {
    return NextResponse.json(
      { error: "id обязателен" },
      { status: 400 }
    );
  }

  const deleted = deleteBatch(batchId);

  if (!deleted) {
    return NextResponse.json(
      { error: "Загрузка не найдена" },
      { status: 404 }
    );
  }

  logAuditEvent({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: "upload_csv",
    details: `Удалена загрузка: ${batchId}`,
  });

  return NextResponse.json({ ok: true });
}
