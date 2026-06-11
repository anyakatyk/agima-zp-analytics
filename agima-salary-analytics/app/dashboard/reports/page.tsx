"use client";

import { useEffect, useMemo, useState } from "react";

type DictEntry = {
  id: string;
  name: string;
};

type RoleOption = {
  role: DictEntry & {
    workshopId: string;
    subWorkshopId: string;
    techStackId?: string;
    grade?: string;
  };
  workshop?: DictEntry;
  subWorkshop?: DictEntry;
  techStack?: DictEntry;
};

type HhSalarySummary = {
  snapshotId: number | null;
  source: "HH";
  observations: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  average: number | null;
  p75: number | null;
  max: number | null;
};

type HhSearch = {
  id: number;
  name: string;
  query: string;
  role: string;
  workshop?: string;
  sub_workshop?: string;
  location: string;
  area: string;
  grade: string;
  stack?: string;
  pages: number;
  subscription_enabled: number;
  frequency?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
};

type HhSnapshot = {
  id: number;
  created_at: string;
  period: string;
  trigger_type: string;
  role: string;
  location: string;
  grade: string;
  stack: string;
  workshop?: string;
  sub_workshop?: string;
  search_id?: number | null;
  search_name?: string | null;
  summary?: {
    observations: number;
    median: number | null;
    average: number | null;
    min: number | null;
    max: number | null;
  } | null;
};

type HhStorageStatus = {
  persistence?: "kv-redis" | "runtime-memory";
  configured?: boolean;
  searchesTotal?: number;
  snapshotsTotal?: number;
  snapshotsReturned?: number;
  lastAction?: "load" | "save" | "none";
  lastError?: string | null;
};

const FREQUENCIES = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "3 месяца" },
  { value: "half_year", label: "Пол года" },
  { value: "year", label: "Год" },
];

function formatSalary(value: number | null): string {
  if (!value) return "—";
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU");
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(false);
  const [filterSalary, setFilterSalary] = useState(false);
  const [exportIncludeBase, setExportIncludeBase] = useState(true);
  const [exportIncludeHh, setExportIncludeHh] = useState(false);
  const [exportWorkshop, setExportWorkshop] = useState("");
  const [exportSubWorkshop, setExportSubWorkshop] = useState("");
  const [exportRole, setExportRole] = useState("");
  const [exportGrade, setExportGrade] = useState("");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exportTechStack, setExportTechStack] = useState("");
  const [hhLoading, setHhLoading] = useState(false);
  const [hhLocation, setHhLocation] = useState("Москва");
  const [hhArea, setHhArea] = useState("1");
  const [hhGrade, setHhGrade] = useState("all");
  const [hhStack, setHhStack] = useState("SQL, Python, BI");
  const [hhPages, setHhPages] = useState(1);
  const [hhWorkshop, setHhWorkshop] = useState("");
  const [hhSubWorkshop, setHhSubWorkshop] = useState("");
  const [hhSubscriptionEnabled, setHhSubscriptionEnabled] = useState(false);
  const [hhFrequency, setHhFrequency] = useState("month");
  const [hhStatus, setHhStatus] = useState<string | null>(null);
  const [hhSummary, setHhSummary] = useState<HhSalarySummary | null>(null);
  const [hhStorageStatus, setHhStorageStatus] = useState<HhStorageStatus | null>(null);
  const [hhSearches, setHhSearches] = useState<HhSearch[]>([]);
  const [hhSnapshots, setHhSnapshots] = useState<HhSnapshot[]>([]);
  const [historySearchFilter, setHistorySearchFilter] = useState("");
  const [historyRoleFilter, setHistoryRoleFilter] = useState("");
  const [historyGradeFilter, setHistoryGradeFilter] = useState("");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [workshops, setWorkshops] = useState<DictEntry[]>([]);
  const [subWorkshops, setSubWorkshops] = useState<Array<DictEntry & { workshopId: string }>>([]);
  const [techStacks, setTechStacks] = useState<Array<DictEntry & { subWorkshopId: string }>>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [showNewRole, setShowNewRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleWorkshopId, setNewRoleWorkshopId] = useState("");
  const [newRoleSubWorkshopId, setNewRoleSubWorkshopId] = useState("");
  const [newRoleTechStackId, setNewRoleTechStackId] = useState("");
  const [newRoleGrade, setNewRoleGrade] = useState("all");
  const [roleStatus, setRoleStatus] = useState<string | null>(null);

  const selectedRole = useMemo(
    () => roles.find((item) => item.role.id === selectedRoleId),
    [roles, selectedRoleId]
  );
  const filteredSubWorkshops = subWorkshops.filter(
    (item) => item.workshopId === newRoleWorkshopId
  );
  const filteredTechStacks = techStacks.filter(
    (item) => item.subWorkshopId === newRoleSubWorkshopId
  );
  const selectedHhWorkshop = workshops.find((item) => item.name === hhWorkshop);
  const hhSubWorkshopOptions = selectedHhWorkshop
    ? subWorkshops.filter((item) => item.workshopId === selectedHhWorkshop.id)
    : subWorkshops;
  const selectedExportWorkshop = workshops.find((item) => item.name === exportWorkshop);
  const exportSubWorkshopOptions = selectedExportWorkshop
    ? subWorkshops.filter((item) => item.workshopId === selectedExportWorkshop.id)
    : subWorkshops;
  const selectedExportSubWorkshop = subWorkshops.find((item) => item.name === exportSubWorkshop);
  const exportTechStackOptions = selectedExportSubWorkshop
    ? techStacks.filter((item) => item.subWorkshopId === selectedExportSubWorkshop.id)
    : techStacks;

  useEffect(() => {
    async function loadDictionaries() {
      try {
        const res = await fetch("/api/dictionaries");
        const data = await res.json();
        const nextRoles = data.roles || [];
        setRoles(nextRoles);
        setWorkshops(data.workshops || []);
        setSubWorkshops(data.subWorkshops || []);
        setTechStacks(data.techStacks || []);
        if (!selectedRoleId && nextRoles.length > 0) {
          const firstRole = nextRoles[0] as RoleOption;
          selectRole(firstRole);
        }
      } catch {
        setRoleStatus("Не удалось загрузить роли");
      }
    }

    void loadDictionaries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadHhHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySearchFilter, historyRoleFilter, historyGradeFilter, historyFromDate, historyToDate]);

  function selectRole(role: RoleOption) {
    setSelectedRoleId(role.role.id);
    setHhStack(role.techStack?.name || "");
    setHhGrade(role.role.grade || "all");
    setHhWorkshop(role.workshop?.name || "");
    setHhSubWorkshop(role.subWorkshop?.name || "");
  }

  async function handleExport() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("includeBase", String(exportIncludeBase));
      params.set("includeHh", String(exportIncludeHh));
      if (filterSalary) params.set("onlyWithSalary", "true");
      if (exportWorkshop) params.set("workshop", exportWorkshop);
      if (exportSubWorkshop) params.set("subWorkshop", exportSubWorkshop);
      if (exportRole) params.set("role", exportRole);
      if (exportGrade) params.set("grade", exportGrade);
      if (exportDateFrom) params.set("dateFrom", exportDateFrom);
      if (exportDateTo) params.set("dateTo", exportDateTo);
      if (exportTechStack) params.set("techStack", exportTechStack);

      if (!exportIncludeBase && !exportIncludeHh) {
        alert("Выберите хотя бы один источник: HH или база");
        return;
      }

      const res = await fetch(`/api/data/export?${params}`);
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Ошибка выгрузки");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `salary-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch {
      alert("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }

  async function handleHhSalaryLoad() {
    await saveOrRunHhSearch("saveAndRun");
  }

  async function saveOrRunHhSearch(action: "save" | "saveAndRun") {
    if (!selectedRole) {
      setHhStatus("Выберите роль или создайте новую");
      return;
    }

    setHhLoading(true);
    setHhStatus(null);
    setHhSummary(null);
    const roleName = selectedRole.role.name;
    try {
      const res = await fetch("/api/hh/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          name: roleName,
          query: roleName,
          role: roleName,
          roleMode: "existing",
          workshop: hhWorkshop,
          subWorkshop: hhSubWorkshop,
          location: hhLocation,
          area: hhArea,
          grade: hhGrade,
          stack: hhStack,
          pages: hhPages,
          subscriptionEnabled: hhSubscriptionEnabled,
          frequency: hhFrequency,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setHhStatus(data.error || "Не удалось подгрузить данные HH");
        return;
      }

      const snapshotId = data.result?.snapshotId;
      setHhStorageStatus(data.storage || null);
      if (data.result?.summary) {
        setHhSummary({
          snapshotId: snapshotId || null,
          source: "HH",
          ...data.result.summary,
        });
      }
      setHhStatus(action === "saveAndRun"
        ? `Готово: поиск сохранён, снимок HH #${snapshotId || "создан"} добавлен в историю`
        : "Поиск сохранён в историю настроек"
      );
      await loadHhHistory();
    } catch {
      setHhStatus("Ошибка соединения при работе с HH-поиском");
    } finally {
      setHhLoading(false);
    }
  }

  async function loadHhHistory() {
    const params = new URLSearchParams();
    if (historySearchFilter) params.set("searchId", historySearchFilter);
    if (historyRoleFilter) params.set("role", historyRoleFilter);
    if (historyGradeFilter) params.set("grade", historyGradeFilter);
    if (historyFromDate) params.set("fromDate", historyFromDate);
    if (historyToDate) params.set("toDate", historyToDate);

    try {
      const res = await fetch(`/api/hh/searches?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setHhSearches(data.searches || []);
      setHhSnapshots(data.snapshots || []);
      setHhStorageStatus(data.storage || null);
    } catch {
      setHhStatus("Не удалось загрузить историю HH");
    }
  }

  async function runDueSubscriptions() {
    setHhLoading(true);
    setHhStatus(null);
    try {
      const res = await fetch("/api/hh/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "runDue" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHhStatus(data.error || "Не удалось обновить подписки");
        return;
      }
      setHhStorageStatus(data.storage || null);
      setHhStatus(`Готово: обновлено подписок ${data.ran || 0}`);
      await loadHhHistory();
    } catch {
      setHhStatus("Ошибка соединения при обновлении подписок");
    } finally {
      setHhLoading(false);
    }
  }

  async function deleteSnapshot(snapshotId: number) {
    if (!window.confirm(`Удалить снимок HH #${snapshotId} из истории?`)) return;
    setHhLoading(true);
    try {
      const res = await fetch("/api/hh/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteSnapshot", snapshotId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHhStatus(data.error || "Не удалось удалить снимок");
        return;
      }
      setHhStorageStatus(data.storage || null);
      setHhStatus(`Снимок HH #${snapshotId} удалён из истории`);
      await loadHhHistory();
    } catch {
      setHhStatus("Ошибка соединения при удалении снимка");
    } finally {
      setHhLoading(false);
    }
  }

  async function handleCreateRole() {
    setRoleStatus(null);
    if (!newRoleName.trim() || !newRoleWorkshopId || !newRoleSubWorkshopId) {
      setRoleStatus("Заполните название роли, цех и подцех");
      return;
    }

    try {
      const res = await fetch("/api/dictionaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "role",
          name: newRoleName,
          workshopId: newRoleWorkshopId,
          subWorkshopId: newRoleSubWorkshopId,
          techStackId: newRoleTechStackId || undefined,
          grade: newRoleGrade === "all" ? undefined : newRoleGrade,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRoleStatus(data.error || "Не удалось создать роль");
        return;
      }

      const workshop = workshops.find((item) => item.id === data.workshopId);
      const subWorkshop = subWorkshops.find((item) => item.id === data.subWorkshopId);
      const techStack = techStacks.find((item) => item.id === data.techStackId);
      const created: RoleOption = {
        role: data,
        workshop,
        subWorkshop,
        techStack,
      };
      setRoles((prev) => [...prev, created]);
      selectRole(created);
      setShowNewRole(false);
      setNewRoleName("");
      setNewRoleWorkshopId("");
      setNewRoleSubWorkshopId("");
      setNewRoleTechStackId("");
      setNewRoleGrade("all");
      setRoleStatus("Роль создана и выбрана");
    } catch {
      setRoleStatus("Ошибка соединения при создании роли");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Отчёты</h1>
        <p className="text-gray-500 mt-1">
          Выгрузка данных в Excel
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,520px)_minmax(0,620px)]">
        <div className="bg-white rounded-xl border border-border p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Экспорт в Excel
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Скачайте отчёт с аналитикой зарплат. Файл содержит 2 листа:
            сводную статистику и полный список кандидатов с фильтрами.
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer rounded-lg border border-border px-3 py-2">
                <input
                  type="checkbox"
                  checked={exportIncludeHh}
                  onChange={(e) => setExportIncludeHh(e.target.checked)}
                  className="rounded"
                />
                HH
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer rounded-lg border border-border px-3 py-2">
                <input
                  type="checkbox"
                  checked={exportIncludeBase}
                  onChange={(e) => setExportIncludeBase(e.target.checked)}
                  className="rounded"
                />
                База
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1.5">Цех</span>
                <select
                  value={exportWorkshop}
                  onChange={(e) => {
                    setExportWorkshop(e.target.value);
                    setExportSubWorkshop("");
                    setExportTechStack("");
                  }}
                  className="select text-sm"
                >
                  <option value="">Все цеха</option>
                  {workshops.map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1.5">Подцех</span>
                <select
                  value={exportSubWorkshop}
                  onChange={(e) => {
                    setExportSubWorkshop(e.target.value);
                    setExportTechStack("");
                  }}
                  className="select text-sm"
                >
                  <option value="">Все подцехи</option>
                  {exportSubWorkshopOptions.map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1.5">Роль</span>
                <select
                  value={exportRole}
                  onChange={(e) => setExportRole(e.target.value)}
                  className="select text-sm"
                >
                  <option value="">Все роли</option>
                  {roles.map((item) => (
                    <option key={item.role.id} value={item.role.name}>{item.role.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1.5">Грейд</span>
                <select
                  value={exportGrade}
                  onChange={(e) => setExportGrade(e.target.value)}
                  className="select text-sm"
                >
                  <option value="">Все грейды</option>
                  <option value="all">all</option>
                  <option value="junior">junior</option>
                  <option value="middle">middle</option>
                  <option value="senior">senior</option>
                  <option value="lead">lead</option>
                  <option value="head">head</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1.5">Дата от</span>
                <input
                  type="date"
                  value={exportDateFrom}
                  onChange={(e) => setExportDateFrom(e.target.value)}
                  className="input text-sm"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1.5">Дата до</span>
                <input
                  type="date"
                  value={exportDateTo}
                  onChange={(e) => setExportDateTo(e.target.value)}
                  className="input text-sm"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="block text-xs font-medium text-gray-500 mb-1.5">Стек</span>
                <select
                  value={exportTechStack}
                  onChange={(e) => setExportTechStack(e.target.value)}
                  className="select text-sm"
                >
                  <option value="">Все стеки</option>
                  {exportTechStackOptions.map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={filterSalary}
                onChange={(e) => setFilterSalary(e.target.checked)}
                className="rounded"
              />
              Только кандидаты с указанной ЗП
            </label>

            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Формирование..." : "Скачать Excel"}
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            Все выгрузки логируются в журнале аудита.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-border p-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Зарплаты HH
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Подгрузка отдельного снимка в HH-аналитику без смешивания с базой Huntflow.
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
              отдельная метрика
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="block text-xs font-medium text-gray-500">Роль</span>
                <button
                  type="button"
                  onClick={() => setShowNewRole((value) => !value)}
                  className="text-xs text-emerald-700 hover:underline"
                >
                  {showNewRole ? "Выбрать существующую" : "Создать новую"}
                </button>
              </div>
              <select
                value={selectedRoleId}
                onChange={(e) => {
                  const role = roles.find((item) => item.role.id === e.target.value);
                  if (role) selectRole(role);
                }}
                className="select text-sm"
                disabled={showNewRole}
              >
                <option value="">Выберите роль</option>
                {roles.map((item) => (
                  <option key={item.role.id} value={item.role.id}>
                    {item.role.name}
                    {item.workshop ? ` · ${item.workshop.name}` : ""}
                    {item.subWorkshop ? ` / ${item.subWorkshop.name}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {showNewRole && (
              <div className="md:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-500 mb-1.5">Название роли</span>
                    <input
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      className="input text-sm"
                      placeholder="Например: Product analyst"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-500 mb-1.5">Цех</span>
                    <select
                      value={newRoleWorkshopId}
                      onChange={(e) => {
                        setNewRoleWorkshopId(e.target.value);
                        setNewRoleSubWorkshopId("");
                        setNewRoleTechStackId("");
                      }}
                      className="select text-sm"
                    >
                      <option value="">Выберите цех</option>
                      {workshops.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-500 mb-1.5">Подцех</span>
                    <select
                      value={newRoleSubWorkshopId}
                      onChange={(e) => {
                        setNewRoleSubWorkshopId(e.target.value);
                        setNewRoleTechStackId("");
                      }}
                      className="select text-sm"
                      disabled={!newRoleWorkshopId}
                    >
                      <option value="">Выберите подцех</option>
                      {filteredSubWorkshops.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-500 mb-1.5">Стек</span>
                    <select
                      value={newRoleTechStackId}
                      onChange={(e) => setNewRoleTechStackId(e.target.value)}
                      className="select text-sm"
                      disabled={!newRoleSubWorkshopId}
                    >
                      <option value="">Без стека</option>
                      {filteredTechStacks.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-500 mb-1.5">Грейд по умолчанию</span>
                    <select
                      value={newRoleGrade}
                      onChange={(e) => setNewRoleGrade(e.target.value)}
                      className="select text-sm"
                    >
                      <option value="all">all</option>
                      <option value="junior">junior</option>
                      <option value="middle">middle</option>
                      <option value="senior">senior</option>
                      <option value="lead">lead</option>
                      <option value="head">head</option>
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleCreateRole}
                  className="mt-4 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
                >
                  Создать роль
                </button>
              </div>
            )}

            {roleStatus && (
              <p className="md:col-span-2 text-sm text-gray-600 rounded-lg bg-gray-50 border border-border px-3 py-2">
                {roleStatus}
              </p>
            )}

            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Локация</span>
              <input
                value={hhLocation}
                onChange={(e) => setHhLocation(e.target.value)}
                className="input text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1.5">HH area id</span>
              <input
                value={hhArea}
                onChange={(e) => setHhArea(e.target.value)}
                className="input text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Цех</span>
              <select
                value={hhWorkshop}
                onChange={(e) => {
                  setHhWorkshop(e.target.value);
                  setHhSubWorkshop("");
                }}
                className="select text-sm"
              >
                <option value="">Выберите цех</option>
                {workshops.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Подцех</span>
              <select
                value={hhSubWorkshop}
                onChange={(e) => setHhSubWorkshop(e.target.value)}
                className="select text-sm"
                disabled={!hhWorkshop}
              >
                <option value="">Выберите подцех</option>
                {hhSubWorkshopOptions.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Грейд</span>
              <select
                value={hhGrade}
                onChange={(e) => setHhGrade(e.target.value)}
                className="select text-sm"
              >
                <option value="all">all</option>
                <option value="junior">junior</option>
                <option value="middle">middle</option>
                <option value="senior">senior</option>
                <option value="lead">lead</option>
                <option value="head">head</option>
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Стек</span>
              <input
                value={hhStack}
                onChange={(e) => setHhStack(e.target.value)}
                className="input text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Страниц HH</span>
              <input
                type="number"
                min={1}
                max={10}
                value={hhPages}
                onChange={(e) => setHhPages(Number(e.target.value))}
                className="input text-sm"
              />
            </label>
            <div className="md:col-span-2 rounded-xl border border-border bg-gray-50 p-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hhSubscriptionEnabled}
                  onChange={(e) => setHhSubscriptionEnabled(e.target.checked)}
                  className="rounded"
                />
                Подписка на поиск
              </label>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-gray-500 mb-1.5">Частота обновления</span>
                  <select
                    value={hhFrequency}
                    onChange={(e) => setHhFrequency(e.target.value)}
                    className="select text-sm"
                    disabled={!hhSubscriptionEnabled}
                  >
                    {FREQUENCIES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-gray-500 self-end">
                  Каждый автоматический запуск будет добавлять новый снимок в историю этого поиска.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={() => saveOrRunHhSearch("save")}
              disabled={hhLoading || !selectedRole}
              className="w-full border border-emerald-200 text-emerald-700 py-2.5 rounded-lg font-medium hover:bg-emerald-50 disabled:opacity-50 transition-colors"
            >
              Сохранить HH-поиск
            </button>
            <button
              onClick={handleHhSalaryLoad}
              disabled={hhLoading || !selectedRole}
              className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {hhLoading ? "Подгружаю данные..." : "Посмотреть ЗП в HH"}
            </button>
          </div>

          {hhStatus && (
            <p className="mt-4 text-sm text-gray-600 rounded-lg bg-gray-50 border border-border px-3 py-2">
              {hhStatus}
            </p>
          )}

          {hhSummary && (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold text-gray-900">HH-аналитика</h3>
                <span className="text-xs px-2.5 py-1 rounded-full bg-white text-emerald-700 border border-emerald-100">
                  Источник: HH
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-white border border-emerald-100 p-3">
                  <p className="text-xs text-gray-500">Резюме с ЗП</p>
                  <p className="text-xl font-bold text-gray-900">{hhSummary.observations}</p>
                </div>
                <div className="rounded-lg bg-white border border-emerald-100 p-3">
                  <p className="text-xs text-gray-500">Медиана</p>
                  <p className="text-xl font-bold text-gray-900">{formatSalary(hhSummary.median)}</p>
                </div>
                <div className="rounded-lg bg-white border border-emerald-100 p-3">
                  <p className="text-xs text-gray-500">Средняя</p>
                  <p className="text-xl font-bold text-gray-900">{formatSalary(hhSummary.average)}</p>
                </div>
                <div className="rounded-lg bg-white border border-emerald-100 p-3">
                  <p className="text-xs text-gray-500">Диапазон</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatSalary(hhSummary.min)} — {formatSalary(hhSummary.max)}
                  </p>
                </div>
              </div>
              {hhSummary.snapshotId && (
                <p className="mt-3 text-xs text-gray-500">Снимок HH #{hhSummary.snapshotId}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">История HH-поисков</h2>
            <p className="text-sm text-gray-500 mt-1">
              Каждый запуск сохраняется отдельным снимком. Ошибочный снимок можно удалить из истории.
            </p>
            {hhStorageStatus && (
              <p className="text-xs text-gray-500 mt-2">
                Хранилище: {hhStorageStatus.persistence === "kv-redis" ? "KV/Redis" : "память сервера"}
                {" · "}всего поисков: {hhStorageStatus.searchesTotal ?? 0}
                {" · "}всего снимков: {hhStorageStatus.snapshotsTotal ?? 0}
                {" · "}показано по фильтрам: {hhStorageStatus.snapshotsReturned ?? hhSnapshots.length}
                {hhStorageStatus.lastError ? ` · ошибка: ${hhStorageStatus.lastError}` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runDueSubscriptions}
              disabled={hhLoading}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Обновить подписки
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-5">
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1.5">Поиск</span>
            <select
              value={historySearchFilter}
              onChange={(e) => setHistorySearchFilter(e.target.value)}
              className="select text-sm"
            >
              <option value="">Все</option>
              {hhSearches.map((search) => (
                <option key={search.id} value={search.id}>{search.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1.5">Роль</span>
            <input
              value={historyRoleFilter}
              onChange={(e) => setHistoryRoleFilter(e.target.value)}
              className="input text-sm"
              placeholder="Роль"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1.5">Грейд</span>
            <select
              value={historyGradeFilter}
              onChange={(e) => setHistoryGradeFilter(e.target.value)}
              className="select text-sm"
            >
              <option value="">Все</option>
              <option value="all">all</option>
              <option value="junior">junior</option>
              <option value="middle">middle</option>
              <option value="senior">senior</option>
              <option value="lead">lead</option>
              <option value="head">head</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1.5">Дата от</span>
            <input
              type="date"
              value={historyFromDate}
              onChange={(e) => setHistoryFromDate(e.target.value)}
              className="input text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1.5">Дата до</span>
            <input
              type="date"
              value={historyToDate}
              onChange={(e) => setHistoryToDate(e.target.value)}
              className="input text-sm"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-gray-500">
                <th className="py-2 pr-3 font-medium">Снимок</th>
                <th className="py-2 pr-3 font-medium">Поиск</th>
                <th className="py-2 pr-3 font-medium">Дата</th>
                <th className="py-2 pr-3 font-medium">Критерии</th>
                <th className="py-2 pr-3 font-medium">Резюме</th>
                <th className="py-2 pr-3 font-medium">Медиана</th>
                <th className="py-2 pr-3 font-medium">Средняя</th>
                <th className="py-2 pr-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {hhSnapshots.map((snapshot) => (
                <tr key={snapshot.id} className="border-b border-border/70">
                  <td className="py-3 pr-3 font-medium text-gray-900">#{snapshot.id}</td>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-gray-900">{snapshot.search_name || snapshot.role}</div>
                    <div className="text-xs text-gray-500">{snapshot.trigger_type}</div>
                  </td>
                  <td className="py-3 pr-3 text-gray-600">{formatDate(snapshot.created_at)}</td>
                  <td className="py-3 pr-3 text-gray-600">
                    {snapshot.role} · {snapshot.location} · {snapshot.grade}
                    {snapshot.workshop ? ` · ${snapshot.workshop}` : ""}
                  </td>
                  <td className="py-3 pr-3 text-gray-900">{snapshot.summary?.observations || 0}</td>
                  <td className="py-3 pr-3 text-gray-900">{formatSalary(snapshot.summary?.median || null)}</td>
                  <td className="py-3 pr-3 text-gray-900">{formatSalary(snapshot.summary?.average || null)}</td>
                  <td className="py-3 pr-3 text-right">
                    <button
                      type="button"
                      onClick={() => deleteSnapshot(snapshot.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
              {hhSnapshots.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    История HH-поисков пока пустая
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
