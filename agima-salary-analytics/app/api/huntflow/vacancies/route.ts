import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME, getUserFromPayload } from "@/lib/auth";
import { canSyncHuntflow } from "@/lib/security/access-control";
import { HuntflowClient } from "@/lib/huntflow-client";

function getVacancyName(vacancy: {
  position?: string;
  name?: string;
  title?: string;
}): string {
  return vacancy.position || vacancy.name || vacancy.title || "Без названия";
}

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

  const hfToken = process.env.HUNTFLOW_API_TOKEN;
  const accountId = process.env.HUNTFLOW_ACCOUNT_ID;

  if (!hfToken || !accountId) {
    return NextResponse.json(
      {
        error:
          "Huntflow API не настроен. Добавьте HUNTFLOW_API_TOKEN и HUNTFLOW_ACCOUNT_ID в .env.local",
      },
      { status: 500 }
    );
  }

  const client = new HuntflowClient(hfToken, parseInt(accountId));
  const vacancies = await client.getVacancies();

  return NextResponse.json(
    {
      vacancies: vacancies.map((vacancy) => ({
        id: vacancy.id,
        name: getVacancyName(vacancy),
        status: vacancy.status || "",
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
