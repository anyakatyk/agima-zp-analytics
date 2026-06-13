import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME, getUserFromPayload } from "@/lib/auth";
import { canSyncHuntflow } from "@/lib/security/access-control";
import { logAuditEvent } from "@/lib/security/audit-log";
import { createHuntflowExportJob } from "@/lib/huntflow-export-jobs";
import { createRefreshAccessToken, getHuntflowAuth } from "@/lib/huntflow-auth";
import { isHuntflowMiddlewareEnabled } from "@/lib/huntflow-middleware-client";

export async function POST(request: NextRequest) {
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

  let vacancyIds: number[] | undefined;
  try {
    const body = await request.json();
    if (Array.isArray(body?.vacancyIds)) {
      vacancyIds = body.vacancyIds
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isFinite(id));
    }
  } catch {
    vacancyIds = undefined;
  }

  const job = createHuntflowExportJob({
    token: auth?.accessToken,
    accountId: auth?.accountId,
    refreshAccessToken: auth
      ? createRefreshAccessToken(auth.refreshToken)
      : undefined,
    useMiddleware,
    vacancyIds,
  });

  logAuditEvent({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: "sync_huntflow",
    details: `Запущена фоновая выгрузка Huntflow, job: ${job.id}${
      vacancyIds?.length ? `, вакансий: ${vacancyIds.length}` : ""
    }`,
  });

  return NextResponse.json({ job }, { status: 202 });
}
