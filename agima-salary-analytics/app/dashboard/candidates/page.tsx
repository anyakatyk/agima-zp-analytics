"use client";

import { Fragment, useEffect, useState } from "react";

type Candidate = {
  id: string;
  displayName: string;
  position: string;
  department: string;
  workshop: string;
  subWorkshop: string;
  grade: string;
  vacancyName: string;
  salaryFrom: number | null;
  salaryTo: number | null;
  salarySource: "field" | "comment" | "none";
  rawSalaryText: string | null;
  commentExcerpt?: string;
  status: string;
  birthDate?: string;
  lastWorkplace?: string;
  createdAt: string;
};

type CandidatesResponse = {
  records: Candidate[];
  total: number;
};

function SalaryBadge({ source }: { source: string }) {
  const styles: Record<string, string> = {
    field: "bg-green-100 text-green-700",
    comment: "bg-yellow-100 text-yellow-700",
    none: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    field: "Поле",
    comment: "Комментарий",
    none: "Не указана",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[source] || styles.none}`}
    >
      {labels[source] || source}
    </span>
  );
}

export default function CandidatesPage() {
  const [data, setData] = useState<CandidatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterSalary, setFilterSalary] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCandidates() {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        perPage: "30",
      });
      if (filterSalary) params.set("onlyWithSalary", "true");

      try {
        const res = await fetch(`/api/data/candidates?${params}`);
        const nextData = await res.json();
        if (!cancelled) setData(nextData);
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCandidates();
    return () => {
      cancelled = true;
    };
  }, [page, filterSalary]);

  const totalPages = data ? Math.ceil(data.total / 30) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Кандидаты</h1>
          <p className="text-gray-500 mt-1">
            {data?.total || 0} записей
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={filterSalary}
            onChange={(e) => {
              setFilterSalary(e.target.checked);
              setPage(1);
            }}
            className="rounded"
          />
          Только с указанной ЗП
        </label>
      </div>

      {loading ? (
        <div className="text-gray-500 py-8 text-center">Загрузка...</div>
      ) : !data?.records.length ? (
        <div className="text-center py-12 text-gray-400">
          Нет данных. Загрузите CSV или синхронизируйте с Huntflow.
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    ФИО
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Вакансия
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Цех
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Грейд
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    ЗП
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Источник
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Дата
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((c) => (
                  <Fragment key={c.id}>
                  <tr
                    className="border-b border-border hover:bg-gray-50 cursor-pointer"
                    onClick={() =>
                      setExpanded(expanded === c.id ? null : c.id)
                    }
                  >
                    <td className="px-4 py-3 font-medium">
                      {c.displayName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.vacancyName || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.workshop || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.grade ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          {c.grade}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.salaryFrom ? (
                        <span className="font-medium">
                          {c.salaryFrom.toLocaleString("ru-RU")}
                          {c.salaryTo &&
                            c.salaryTo !== c.salaryFrom &&
                            ` — ${c.salaryTo.toLocaleString("ru-RU")}`}
                          <span className="text-gray-400 text-xs ml-1">
                            руб.
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <SalaryBadge source={c.salarySource} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString("ru-RU") : "—"}
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr key={`${c.id}-detail`}>
                      <td colSpan={7} className="px-4 py-3 bg-gray-50">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          {c.position && (
                            <div><span className="text-gray-500">Должность:</span> {c.position}</div>
                          )}
                          {c.subWorkshop && (
                            <div><span className="text-gray-500">Подцех:</span> {c.subWorkshop}</div>
                          )}
                          {c.department && (
                            <div><span className="text-gray-500">Отдел:</span> {c.department}</div>
                          )}
                          {c.birthDate && (
                            <div><span className="text-gray-500">Дата рождения:</span> {c.birthDate}</div>
                          )}
                          {c.lastWorkplace && (
                            <div><span className="text-gray-500">Последнее место работы:</span> {c.lastWorkplace}</div>
                          )}
                          {c.rawSalaryText && (
                            <div className="col-span-2"><span className="text-gray-500">Исходный текст ЗП:</span> {c.rawSalaryText}</div>
                          )}
                          {c.commentExcerpt && (
                            <div className="col-span-2"><span className="text-gray-500">Комментарий:</span> {c.commentExcerpt}</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Пагинация */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Назад
              </button>
              <span className="text-sm text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Вперёд
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
