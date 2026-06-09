import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth-token";

// Публичные маршруты
const PUBLIC_ROUTES = ["/login", "/"];

// Маршруты только для admin
const ADMIN_ROUTES = ["/settings", "/api/huntflow/", "/api/audit/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Пропускаем статику
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Публичные маршруты
  const isPublic = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname === r + "/"
  );
  if (isPublic) {
    return NextResponse.next();
  }

  // API auth routes
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // Проверяем токен
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Верифицируем JWT
  const payload = await verifyToken(token);
  if (!payload) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json(
          { error: "Invalid token" },
          { status: 401 }
        )
      : NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  // Проверка роли для admin-маршрутов
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  if (isAdminRoute && payload.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Добавляем заголовки с информацией о пользователе
  const response = NextResponse.next();
  response.headers.set("x-user-id", payload.sub);
  response.headers.set("x-user-role", payload.role);
  response.headers.set("x-user-name", encodeURIComponent(payload.name));
  if (payload.department) {
    response.headers.set(
      "x-user-department",
      encodeURIComponent(payload.department)
    );
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
