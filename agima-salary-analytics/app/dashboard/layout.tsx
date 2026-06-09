"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  department?: string;
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Дашборд", icon: "grid" },
  { href: "/dashboard/candidates", label: "Кандидаты", icon: "users" },
  { href: "/dashboard/vacancies", label: "Вакансии", icon: "briefcase" },
  { href: "/dashboard/reports", label: "Отчёты", icon: "chart" },
  { href: "/dashboard/dictionaries", label: "Структура", icon: "layers" },
  { href: "/dashboard/settings", label: "Настройки", icon: "settings", adminOnly: true },
];

function NavIcon({ name, className = "" }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    grid: <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>,
    users: <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    briefcase: <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
    chart: <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    layers: <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>,
    settings: <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  };
  return <>{icons[name] || null}</>;
}

// Эмблема AGIMA
function AgimaLogo({ size = "lg" }: { size?: "sm" | "lg" }) {
  const s = size === "lg" ? "w-10 h-10" : "w-8 h-8";
  const text = size === "lg" ? "text-lg" : "text-sm";
  return (
    <div className="flex items-center gap-3">
      <div className={`${s} relative rounded-xl overflow-hidden flex-shrink-0`}>
        {/* Градиентный фон */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600" />
        {/* SVG эмблема */}
        <svg className="relative w-full h-full p-1.5" viewBox="0 0 32 32" fill="none">
          {/* Стилизованная буква A */}
          <path d="M16 4L6 26h4l2-5h8l2 5h4L16 4zm0 8l3 7h-6l3-7z" fill="white" opacity="0.95"/>
          {/* Горизонтальная перекладина — абстрактный элемент */}
          <rect x="8" y="18" width="16" height="2" rx="1" fill="white" opacity="0.3"/>
        </svg>
      </div>
      {size === "lg" && (
        <div>
          <h1 className={`${text} font-bold text-white tracking-tight`}>AGIMA</h1>
          <p className="text-[10px] text-emerald-300/70 tracking-widest uppercase">Analytics</p>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Not auth");
        return res.json();
      })
      .then((data) => setUser(data.user))
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogout() {
    document.cookie = "auth-token=; path=/; max-age=0";
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center hero-gradient">
        <div className="flex items-center gap-3 text-text-secondary">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Загрузка...
        </div>
      </div>
    );
  }

  if (!user) return null;

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user.role === "admin"
  );

  return (
    <div className="min-h-screen flex">
      {/* Сайдбар */}
      <aside className="w-60 flex flex-col bg-gradient-to-b from-gray-950 via-gray-900 to-emerald-950 relative overflow-hidden">
        {/* Декоративный градиент сверху */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-emerald-500/10 to-transparent pointer-events-none" />

        {/* Логотип */}
        <div className="relative p-5 border-b border-white/5">
          <AgimaLogo />
        </div>

        {/* Навигация */}
        <nav className="relative flex-1 p-3 space-y-0.5">
          {visibleNav.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  isActive
                    ? "bg-emerald-500/15 text-white font-medium"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <NavIcon name={item.icon} className="w-[18px] h-[18px] flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Пользователь */}
        <div className="relative p-3 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user.name}
                </p>
                <p className="text-[11px] text-gray-500 truncate">
                  {user.role === "admin"
                    ? "Администратор"
                    : user.role === "hr"
                      ? "HR"
                      : "Руководитель"}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5"
              title="Выйти"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Основной контент */}
      <main className="flex-1 overflow-auto bg-background">
        <div className="p-8 max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
