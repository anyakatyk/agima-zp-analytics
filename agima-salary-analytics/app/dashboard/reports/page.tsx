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

export default function ReportsPage() {
  const [loading, setLoading] = useState(false);
  const [filterSalary, setFilterSalary] = useState(false);
  const [hhLoading, setHhLoading] = useState(false);
  const [hhLocation, setHhLocation] = useState("Москва");
  const [hhArea, setHhArea] = useState("1");
  const [hhGrade, setHhGrade] = useState("all");
  const [hhStack, setHhStack] = useState("SQL, Python, BI");
  const [hhPages, setHhPages] = useState(1);
  const [hhStatus, setHhStatus] = useState<string | null>(null);
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

  function selectRole(role: RoleOption) {
    setSelectedRoleId(role.role.id);
    setHhStack(role.techStack?.name || "");
    setHhGrade(role.role.grade || "all");
  }

  async function handleExport() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSalary) params.set("onlyWithSalary", "true");

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
    if (!selectedRole) {
      setHhStatus("Выберите роль или создайте новую");
      return;
    }

    setHhLoading(true);
    setHhStatus(null);
    const roleName = selectedRole.role.name;
    try {
      const res = await fetch("/api/hh/salary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: roleName,
          role: roleName,
          roleMode: "existing",
          workshop: selectedRole.workshop?.name || "",
          subWorkshop: selectedRole.subWorkshop?.name || "",
          location: hhLocation,
          area: hhArea,
          grade: hhGrade,
          stack: hhStack,
          pages: hhPages,
          triggerType: "on_demand",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setHhStatus(data.error || "Не удалось подгрузить данные HH");
        return;
      }

      const snapshotLine = String(data.snapshot || "")
        .split("\n")
        .find((line) => line.startsWith("snapshot_id="));
      const observationsLine = String(data.snapshot || "")
        .split("\n")
        .find((line) => line.startsWith("observations="));

      setHhStatus(
        `Готово: ${snapshotLine || "снимок создан"}, ${observationsLine || "данные обновлены"}`
      );
    } catch {
      setHhStatus("Ошибка соединения при подгрузке HH");
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
          </div>

          <button
            onClick={handleHhSalaryLoad}
            disabled={hhLoading || !selectedRole}
            className="mt-5 w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {hhLoading ? "Подгружаю данные..." : "Посмотреть ЗП в HH"}
          </button>

          {hhStatus && (
            <p className="mt-4 text-sm text-gray-600 rounded-lg bg-gray-50 border border-border px-3 py-2">
              {hhStatus}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
