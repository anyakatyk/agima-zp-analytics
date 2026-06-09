import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getHuntflowExportJob } from "@/lib/huntflow-export-jobs";

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
  const job = getHuntflowExportJob(id);
  if (!job) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }

  return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
}
