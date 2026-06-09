"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Stats = {
  count: number;
  countWithSalary: number;
  countWithoutSalary: number;
  averageSalary: number;
  medianSalary: number;
  minSalary: number;
  maxSalary: number;
  salaryRanges: Array<{ range: string; count: number }>;
};

type VacancyStat = {
  name: string;
  count: number;
  avgSalary: number;
};

type Candidate = {
  id: string;
  displayName: string;
  vacancyName: string;
  salaryFrom: number | null;
  salaryTo: number | null;
  salarySource: string;
  grade: string;
  birthDate?: string;
  createdAt: string;
};

function formatSalary(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}к`;
  return String(n);
}

function KPICard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center text-primary">
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [vacancies, setVacancies] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Фильтры
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [vacancyFilter, setVacancyFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [birthDateFrom, setBirthDateFrom] = useState("");
  const [birthDateTo, setBirthDateTo] = useState("");
  const [onlyWithSalary, setOnlyWithSalary] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (vacancyFilter) params.set("vacancyId", vacancyFilter);
      if (gradeFilter) params.set("grade", gradeFilter);
      if (birthDateFrom) params.set("birthDateFrom", birthDateFrom);
      if (birthDateTo) params.set("birthDateTo", birthDateTo);
      if (onlyWithSalary) params.set("onlyWithSalary", "true");

      try {
        const [statsRes, candRes] = await Promise.all([
          fetch(`/api/data/stats?${params}`),
          fetch(`/api/data/candidates?${params}&perPage=1000`),
        ]);
        const statsData = await statsRes.json();
        const candData = await candRes.json();
        if (cancelled) return;

        setStats(statsData);
        setCandidates(candData.records || []);

        const allCand = candData.records || [];
        const uniqueVacancies = Array.from(new Set(allCand.map((c: Candidate) => c.vacancyName).filter(Boolean))) as string[];
        const uniqueGrades = Array.from(new Set(allCand.map((c: Candidate) => c.grade).filter(Boolean))) as string[];
        setVacancies(uniqueVacancies);
        setGrades(uniqueGrades);
      } catch {
        console.error("Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, vacancyFilter, gradeFilter, birthDateFrom, birthDateTo, onlyWithSalary]);

  // Агрегация по вакансиям
  const vacancyStats: VacancyStat[] = (() => {
    const map = new Map<string, { count: number; totalSalary: number; withSalary: number }>();
    for (const c of candidates) {
      if (!c.vacancyName) continue;
      const existing = map.get(c.vacancyName) || { count: 0, totalSalary: 0, withSalary: 0 };
      existing.count++;
      if (c.salaryFrom && c.salarySource !== "none") {
        existing.totalSalary += c.salaryFrom;
        existing.withSalary++;
      }
      map.set(c.vacancyName, existing);
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        avgSalary: data.withSalary > 0 ? Math.round(data.totalSalary / data.withSalary) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  })();

  // Агрегация по грейдам
  const gradeStats = (() => {
    const map = new Map<string, { count: number; totalSalary: number; withSalary: number }>();
    for (const c of candidates) {
      if (!c.grade) continue;
      const existing = map.get(c.grade) || { count: 0, totalSalary: 0, withSalary: 0 };
      existing.count++;
      if (c.salaryFrom && c.salarySource !== "none") {
        existing.totalSalary += c.salaryFrom;
        existing.withSalary++;
      }
      map.set(c.grade, existing);
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        avgSalary: data.withSalary > 0 ? Math.round(data.totalSalary / data.withSalary) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  })();

  // Тренд ЗП по месяцам (на основе дат из выгрузки)
  const trendData = (() => {
    const map = new Map<string, { count: number; totalSalary: number; withSalary: number }>();
    for (const c of candidates) {
      if (!c.createdAt) continue;
      const date = new Date(c.createdAt);
      if (isNaN(date.getTime())) continue;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const existing = map.get(monthKey) || { count: 0, totalSalary: 0, withSalary: 0 };
      existing.count++;
      if (c.salaryFrom && c.salarySource !== "none") {
        existing.totalSalary += c.salaryFrom;
        existing.withSalary++;
      }
      map.set(monthKey, existing);
    }
    return Array.from(map.entries())
      .map(([month, data]) => ({
        month,
        avgSalary: data.withSalary > 0 ? Math.round(data.totalSalary / data.withSalary) : 0,
        count: data.count,
        withSalary: data.withSalary,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  })();

  if (loading && !stats) {
    return <div className="text-text-secondary">Загрузка статистики...</div>;
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary text-lg">Нет данных</p>
        <p className="text-text-muted text-sm mt-2">
          Загрузите CSV файл или синхронизируйте с Huntflow
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Дашборд</h1>
        <p className="text-text-secondary mt-1">Обзор аналитики зарплат</p>
      </div>

      {/* Фильтры */}
      <div className="card p-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Дата от</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Дата до</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Вакансия</label>
            <select
              value={vacancyFilter}
              onChange={(e) => setVacancyFilter(e.target.value)}
              className="select text-sm"
            >
              <option value="">Все</option>
              {vacancies.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Грейд</label>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-border rounded-lg text-sm"
            >
              <option value="">Все</option>
              {grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Дата рождения от</label>
            <input
              type="date"
              value={birthDateFrom}
              onChange={(e) => setBirthDateFrom(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Дата рождения до</label>
            <input
              type="date"
              value={birthDateTo}
              onChange={(e) => setBirthDateTo(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-border rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyWithSalary}
              onChange={(e) => setOnlyWithSalary(e.target.checked)}
              className="rounded"
            />
            Только с указанной ЗП
          </label>
        </div>
      </div>

      {/* KPI карточки */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Всего кандидатов"
          value={String(stats.count)}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <KPICard
          label="С указанной ЗП"
          value={String(stats.countWithSalary)}
          sub={`${stats.count > 0 ? Math.round((stats.countWithSalary / stats.count) * 100) : 0}% от общего`}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KPICard
          label="Средняя ЗП"
          value={formatSalary(stats.averageSalary)}
          sub={`Медиана: ${formatSalary(stats.medianSalary)}`}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
        <KPICard
          label="Диапазон ЗП"
          value={stats.minSalary > 0 ? `${formatSalary(stats.minSalary)} — ${formatSalary(stats.maxSalary)}` : "—"}
          sub="мин — макс"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
        />
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Распределение ЗП */}
        {stats.salaryRanges.length > 0 && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Распределение зарплат
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.salaryRanges}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${value} чел.`, "Количество"]} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ЗП по вакансиям */}
        {vacancyStats.length > 0 && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              ЗП по вакансиям
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vacancyStats} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatSalary(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(value) => [formatSalary(value as number), "Средняя ЗП"]} />
                  <Bar dataKey="avgSalary" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Кандидатов по вакансиям */}
        {vacancyStats.length > 0 && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Кандидатов по вакансиям
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vacancyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${value} чел.`, "Кандидатов"]} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ЗП по грейдам */}
        {gradeStats.length > 0 && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              ЗП по грейдам
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gradeStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatSalary(v)} />
                  <Tooltip formatter={(value) => [formatSalary(value as number), "Средняя ЗП"]} />
                  <Bar dataKey="avgSalary" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Тренд ЗП по месяцам */}
      {trendData.length > 1 && (
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Динамика средней ЗП по месяцам
          </h2>
          <p className="text-sm text-text-secondary mb-4">
            Средняя зарплата кандидатов в зависимости от даты добавления резюме
          </p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatSalary(v)}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "avgSalary") return [formatSalary(value as number), "Средняя ЗП"];
                    return [value, "Кандидатов"];
                  }}
                  labelFormatter={(label) => `Месяц: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="avgSalary"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#3b82f6" }}
                  name="avgSalary"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
