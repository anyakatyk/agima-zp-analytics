"use client";

import { useEffect, useState } from "react";

type Candidate = {
  id: string;
  displayName: string;
  workshop: string;
  subWorkshop: string;
  vacancyName: string;
  salaryFrom: number | null;
  salaryTo: number | null;
  salarySource: string;
  grade: string;
};

type VacancyGroup = {
  name: string;
  count: number;
  withSalary: number;
  avgSalary: number;
  grades: Record<string, number>;
};

type SubWorkshopGroup = {
  name: string;
  vacancies: VacancyGroup[];
  count: number;
  withSalary: number;
  avgSalary: number;
};

type WorkshopGroup = {
  name: string;
  subWorkshops: SubWorkshopGroup[];
  count: number;
  withSalary: number;
  avgSalary: number;
};

function formatSalary(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}к`;
  return String(n);
}

function calcAvg(candidates: Candidate[]): { count: number; withSalary: number; avg: number } {
  let withSalary = 0;
  let totalSalary = 0;
  for (const c of candidates) {
    if (c.salaryFrom && c.salarySource !== "none") {
      totalSalary += c.salaryFrom;
      withSalary++;
    }
  }
  return {
    count: candidates.length,
    withSalary,
    avg: withSalary > 0 ? Math.round(totalSalary / withSalary) : 0,
  };
}

export default function VacanciesPage() {
  const [workshops, setWorkshops] = useState<WorkshopGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/data/candidates?perPage=5000")
      .then((r) => r.json())
      .then((data) => {
        const candidates: Candidate[] = data.records || [];

        // Группируем: workshop → subWorkshop → vacancy
        const wMap = new Map<string, Map<string, Map<string, Candidate[]>>>();

        for (const c of candidates) {
          const w = c.workshop || "Без цеха";
          const s = c.subWorkshop || "Без подцеха";
          const v = c.vacancyName || "Без вакансии";

          if (!wMap.has(w)) wMap.set(w, new Map());
          const sMap = wMap.get(w)!;
          if (!sMap.has(s)) sMap.set(s, new Map());
          const vMap = sMap.get(s)!;
          if (!vMap.has(v)) vMap.set(v, []);
          vMap.get(v)!.push(c);
        }

        // Собираем структуру
        const result: WorkshopGroup[] = [];

        for (const [wName, sMap] of wMap) {
          const allWCandidates: Candidate[] = [];
          const subWorkshops: SubWorkshopGroup[] = [];

          for (const [sName, vMap] of sMap) {
            const allSCandidates: Candidate[] = [];
            const vacancies: VacancyGroup[] = [];

            for (const [vName, vCandidates] of vMap) {
              allSCandidates.push(...vCandidates);
              const grades: Record<string, number> = {};
              for (const c of vCandidates) {
                if (c.grade) grades[c.grade] = (grades[c.grade] || 0) + 1;
              }
              const stats = calcAvg(vCandidates);
              vacancies.push({
                name: vName,
                count: stats.count,
                withSalary: stats.withSalary,
                avgSalary: stats.avg,
                grades,
              });
            }

            allWCandidates.push(...allSCandidates);
            const sStats = calcAvg(allSCandidates);
            subWorkshops.push({
              name: sName,
              vacancies: vacancies.sort((a, b) => b.count - a.count),
              count: sStats.count,
              withSalary: sStats.withSalary,
              avgSalary: sStats.avg,
            });
          }

          const wStats = calcAvg(allWCandidates);
          result.push({
            name: wName,
            subWorkshops: subWorkshops.sort((a, b) => b.count - a.count),
            count: wStats.count,
            withSalary: wStats.withSalary,
            avgSalary: wStats.avg,
          });
        }

        setWorkshops(result.sort((a, b) => b.count - a.count));

        // Разворачиваем все цеха по умолчанию
        setExpanded(new Set(result.map((w) => w.name)));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Вакансии</h1>
        <p className="text-text-secondary mt-1">
          Структура вакансий по цехам и подцехам
        </p>
      </div>

      {loading ? (
        <div className="text-text-secondary py-8 text-center">Загрузка...</div>
      ) : workshops.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          Нет данных о вакансиях
        </div>
      ) : (
        <div className="space-y-4">
          {workshops.map((w) => (
            <div key={w.name} className="card overflow-hidden">
              {/* Заголовок цеха */}
              <button
                onClick={() => toggle(w.name)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-primary-subtle transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <svg
                    className={`w-4 h-4 text-text-muted transition-transform ${expanded.has(w.name) ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <h2 className="text-lg font-semibold text-foreground">{w.name}</h2>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-text-secondary">{w.count} кандидатов</span>
                  {w.avgSalary > 0 && (
                    <span className="font-medium text-foreground">
                      ~{formatSalary(w.avgSalary)} руб.
                    </span>
                  )}
                  <span className="badge badge-green">
                    {w.subWorkshops.length} подцех{w.subWorkshops.length === 1 ? "" : "ов"}
                  </span>
                </div>
              </button>

              {/* Содержимое цеха */}
              {expanded.has(w.name) && (
                <div className="border-t border-border">
                  {w.subWorkshops.map((s) => (
                    <div key={s.name}>
                      {/* Заголовок подцеха */}
                      <button
                        onClick={() => toggle(`${w.name}/${s.name}`)}
                        className="w-full flex items-center justify-between px-6 py-3 pl-12 hover:bg-gray-50 transition-colors text-left border-b border-border-light"
                      >
                        <div className="flex items-center gap-3">
                          <svg
                            className={`w-3.5 h-3.5 text-text-muted transition-transform ${expanded.has(`${w.name}/${s.name}`) ? "rotate-90" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <h3 className="font-medium text-foreground">{s.name}</h3>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-text-secondary">{s.count} кандидатов</span>
                          {s.avgSalary > 0 && (
                            <span className="text-foreground">
                              ~{formatSalary(s.avgSalary)} руб.
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Вакансии внутри подцеха */}
                      {expanded.has(`${w.name}/${s.name}`) && (
                        <div className="bg-gray-50/50">
                          {s.vacancies.length === 0 ? (
                            <p className="px-16 py-3 text-sm text-text-muted">Нет вакансий</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-text-muted">
                                  <th className="text-left px-16 py-2 font-medium">Вакансия</th>
                                  <th className="text-center px-4 py-2 font-medium">Кандидатов</th>
                                  <th className="text-center px-4 py-2 font-medium">С ЗП</th>
                                  <th className="text-center px-4 py-2 font-medium">Средняя ЗП</th>
                                  <th className="text-left px-4 py-2 font-medium">Грейды</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.vacancies.map((v) => (
                                  <tr key={v.name} className="border-t border-border-light hover:bg-white/60">
                                    <td className="px-16 py-2.5 font-medium text-foreground">{v.name}</td>
                                    <td className="px-4 py-2.5 text-center text-text-secondary">{v.count}</td>
                                    <td className="px-4 py-2.5 text-center text-text-secondary">
                                      {v.withSalary > 0 ? v.withSalary : "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      {v.avgSalary > 0 ? (
                                        <span className="font-medium">{formatSalary(v.avgSalary)} руб.</span>
                                      ) : (
                                        <span className="text-text-muted">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <div className="flex gap-1 flex-wrap">
                                        {Object.entries(v.grades).map(([grade, cnt]) => (
                                          <span key={grade} className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">
                                            {grade}: {cnt}
                                          </span>
                                        ))}
                                        {Object.keys(v.grades).length === 0 && (
                                          <span className="text-text-muted">—</span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
