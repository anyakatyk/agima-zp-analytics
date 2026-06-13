import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME, getUserFromPayload } from "@/lib/auth";
import { canSyncHuntflow } from "@/lib/security/access-control";
import { logAuditEvent } from "@/lib/security/audit-log";
import { buildCleanHuntflowWorkbook } from "@/lib/huntflow-clean-export";
import { createRefreshAccessToken, getHuntflowAuth } from "@/lib/huntflow-auth";
import {
  getMiddlewareExportRows,
  isHuntflowMiddlewareEnabled,
} from "@/lib/huntflow-middleware-client";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const user = getUserFromPayload(payload);
  if (!canSyncHuntflow(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const useMiddleware = isHuntflowMiddlewareEnabled();
  const auth = useMiddleware ? null : await getHuntflowAuth();

  if (!useMiddleware && !auth) {
    return NextResponse.json(
      {
        error:
          "Huntflow API не настроен. Добавьте HUNTFLOW_MIDDLEWARE_URL или HUNTFLOW_REFRESH_TOKEN и HUNTFLOW_ACCOUNT_ID в переменные окружения",
      },
      { status: 500 }
    );
  }

  try {
    const rawRows = useMiddleware ? await getMiddlewareExportRows() : undefined;
    const result = await buildCleanHuntflowWorkbook({
      token: auth?.accessToken,
      accountId: auth?.accountId,
      refreshAccessToken: auth
        ? createRefreshAccessToken(auth.refreshToken)
        : undefined,
      rawRows,
    });

    logAuditEvent({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "sync_huntflow",
      details: `Скачана очищенная внутренней LLM выгрузка Huntflow, ${result.recordCount} записей`,
    });

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Ошибка выгрузки Huntflow";

    logAuditEvent({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "sync_huntflow",
      details: `Ошибка выгрузки: ${message}`,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
