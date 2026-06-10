"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ошибка авторизации");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center hero-gradient">
      <div className="w-full max-w-md">
        {/* Логотип */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 relative rounded-xl overflow-hidden flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600" />
              <svg className="relative w-full h-full p-2" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L6 26h4l2-5h8l2 5h4L16 4zm0 8l3 7h-6l3-7z" fill="white" opacity="0.95"/>
                <rect x="8" y="18" width="16" height="2" rx="1" fill="white" opacity="0.3"/>
              </svg>
            </div>
            <div className="text-left">
              <span className="text-2xl font-bold text-foreground tracking-tight">AGIMA</span>
              <p className="text-[10px] text-text-muted tracking-widest uppercase">Analytics</p>
            </div>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Salary Analytics</h1>
          <p className="text-text-secondary mt-1">Аналитика зарплат кандидатов</p>
        </div>

        {/* Форма */}
        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
                placeholder="user@agima.ru"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input"
                placeholder="Введите пароль"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base"
            >
              {loading ? "Вход..." : "Войти"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
