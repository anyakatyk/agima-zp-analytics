import { NextRequest, NextResponse } from "next/server";
import { authenticate, COOKIE_NAME } from "@/lib/auth";
import { logAuditEvent } from "@/lib/security/audit-log";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email и пароль обязательны" },
        { status: 400 }
      );
    }

    const result = await authenticate(email, password);
    if (!result) {
      return NextResponse.json(
        { error: "Неверный email или пароль" },
        { status: 401 }
      );
    }

    // Логируем вход
    logAuditEvent({
      userId: result.user.id,
      userName: result.user.name,
      userRole: result.user.role,
      action: "login",
    });

    const response = NextResponse.json({
      user: result.user,
      token: result.token,
    });

    // Устанавливаем httpOnly cookie
    response.cookies.set(COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60, // 8 часов
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Ошибка сервера" },
      { status: 500 }
    );
  }
}
