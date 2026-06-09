import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid token" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    user: {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      department: payload.department,
    },
  });
}
