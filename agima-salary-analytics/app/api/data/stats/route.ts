import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME, getUserFromPayload } from "@/lib/auth";
import { dataStore } from "@/lib/data-store";
import { DataAccessLayer } from "@/lib/security/data-access-layer";
import type { FilterState } from "@/lib/types";

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
  const { searchParams } = request.nextUrl;

  const filters: FilterState = {
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
    vacancyId: searchParams.get("vacancyId"),
    department: searchParams.get("department"),
    workshop: searchParams.get("workshop"),
    subWorkshop: searchParams.get("subWorkshop"),
    techStack: searchParams.get("techStack"),
    grade: searchParams.get("grade"),
    birthDateFrom: searchParams.get("birthDateFrom"),
    birthDateTo: searchParams.get("birthDateTo"),
    showOnlyWithSalary: searchParams.get("onlyWithSalary") === "true",
  };

  const dal = new DataAccessLayer(
    () => dataStore.getAll(),
    (f) => dataStore.getStats(f)
  );

  const stats = dal.getStatsForUser(user, filters);

  return NextResponse.json(stats, {
    headers: { "Cache-Control": "no-store" },
  });
}
