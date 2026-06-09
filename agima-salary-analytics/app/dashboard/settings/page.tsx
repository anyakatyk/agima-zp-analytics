"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Batch = {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  recordCount: number;
  recordsWithSalary: number;
  columnMapping: Record<string, string>;
  departmentOverride?: string;
};

type HuntflowExportJob = {
  id: string;
  status: "queued" | "running" | "ready" | "error";
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  stage?: string;
  message?: string;
  progressCurrent?: number;
  progressTotal?: number;
  fileName?: string;
  recordCount?: number;
  error?: string;
};

type HuntflowVacancyOption = {
  id: number;
  name: string;
  status?: string;
};

// Обратный маппинг: поле → человекочитаемое название
const FIELD_LABELS: Record<string, string> = {
  id: "ID",
  fullName: "ФИО",
  position: "Должность",
  vacancyName: "Вакансия",
  workshop: "Цех",
  subWorkshop: "Подцех",
  techStack: "Стек",
  department: "Отдел",
  grade: "Грейд",
  salaryRaw: "Зарплата",
  salaryFrom: "ЗП от",
  salaryTo: "ЗП до",
  commentExcerpt: "Комментарий",
  status: "Статус",
  createdAt: "Дата",
  birthDate: "Дата рождения",
  lastWorkplace: "Последнее место работы",
};

export default function SettingsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<HuntflowExportJob | null>(null);
  const [huntflowVacancies, setHuntflowVacancies] = useState<HuntflowVacancyOption[]>([]);
  const [vacanciesLoading, setVacanciesLoading] = useState(false);
  const [vacanciesError, setVacanciesError] = useState<string | null>(null);
  const [exportScope, setExportScope] = useState<"all" | "selected">("all");
  const [selectedVacancyIds, setSelectedVacancyIds] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Состояние для маппинга
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [departmentOverride, setDepartmentOverride] = useState("");
  const [workshopOverride, setWorkshopOverride] = useState("");
  const [subWorkshopOverride, setSubWorkshopOverride] = useState("");
  const [techStackOverride, setTechStackOverride] = useState("");
  const [gradeOverride, setGradeOverride] = useState("");
  const [showMapping, setShowMapping] = useState(false);

  const loadBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/upload/batches");
      const data = await res.json();
      setBatches(data.batches || []);
    } catch {
      console.error("Failed to load batches");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHuntflowVacancies = useCallback(async () => {
    setVacanciesLoading(true);
    setVacanciesError(null);
    try {
      const res = await fetch("/api/huntflow/vacancies");
      const data = await res.json();
      if (!res.ok) {
        setVacanciesError(data.error || "Не удалось загрузить вакансии");
        return;
      }
      setHuntflowVacancies(data.vacancies || []);
    } catch {
      setVacanciesError("Не удалось загрузить вакансии");
    } finally {
      setVacanciesLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialBatches() {
      try {
        const res = await fetch("/api/upload/batches");
        const data = await res.json();
        if (!cancelled) setBatches(data.batches || []);
      } catch {
        console.error("Failed to load batches");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialBatches();
    return () => {
      cancelled = true;
    };
  }, []);

  // Когда выбран файл — показываем маппинг
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setUploadResult(null);

    // Читаем заголовки файла
    const ext = file.name.split(".").pop()?.toLowerCase();
    const buffer = await file.arrayBuffer();

    let headers: string[] = [];

    if (ext === "csv") {
      const text = new TextDecoder("utf-8").decode(buffer);
      const firstLine = text.split("\n")[0];
      headers = firstLine.split(/[;,]/).map((h) => h.trim().replace(/^"|"$/g, ""));
    } else if (ext === "xlsx" || ext === "xls") {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
        headers.push(cell?.v?.toString() || `Столбец ${c + 1}`);
      }
    }

    setDetectedColumns(headers);

    // Автоматический маппинг (точное совпадение + вхождение)
    const autoMapping: Record<string, string> = {};
    const EXACT_MAP: Record<string, string> = {
      id: "id", ид: "id",
      фио: "fullName", имя: "fullName", name: "fullName", кандидат: "fullName", "full name": "fullName",
      должность: "position", позиция: "position", position: "position", "текущая должность": "position",
      вакансия: "vacancyName", "название вакансии": "vacancyName", vacancy: "vacancyName",
      отдел: "workshop", department: "workshop",
      цех: "workshop", workshop: "workshop",
      подразделение: "subWorkshop", подцех: "subWorkshop", "sub-workshop": "subWorkshop", subworkshop: "subWorkshop",
      стек: "techStack", stack: "techStack", "tech stack": "techStack",
      грейд: "grade", grade: "grade", уровень: "grade",
      зп: "salaryRaw", зарплата: "salaryRaw", salary: "salaryRaw",
      "salary from": "salaryFrom", "salary to": "salaryTo",
      комментарий: "commentExcerpt", comment: "commentExcerpt", примечание: "commentExcerpt",
      статус: "status", status: "status", "текущий этап подбора": "status",
      дата: "createdAt", date: "createdAt", "дата добавления": "createdAt", "дата выгрузки": "createdAt",
      "дата рождения": "birthDate", "birth date": "birthDate",
      "последнее место работы": "lastWorkplace", "место работы": "lastWorkplace",
    };
    const sortedKeys = Object.keys(EXACT_MAP).sort((a, b) => b.length - a.length);
    for (const h of headers) {
      const lower = h.toLowerCase().trim().replace(/\s+/g, " ");
      // Точное совпадение
      if (EXACT_MAP[lower]) {
        autoMapping[h] = EXACT_MAP[lower];
        continue;
      }
      // Вхождение ключевого слова
      for (const key of sortedKeys) {
        if (lower.includes(key) || key.includes(lower)) {
          autoMapping[h] = EXACT_MAP[key];
          break;
        }
      }
    }

    setColumnMapping(autoMapping);
    setShowMapping(true);
  }

  async function handleUpload() {
    if (!selectedFile) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("columnMapping", JSON.stringify(columnMapping));
      if (departmentOverride) {
        formData.append("department", departmentOverride);
      }
      if (workshopOverride) {
        formData.append("workshop", workshopOverride);
      }
      if (subWorkshopOverride) {
        formData.append("subWorkshop", subWorkshopOverride);
      }
      if (techStackOverride) {
        formData.append("techStack", techStackOverride);
      }
      if (gradeOverride) {
        formData.append("grade", gradeOverride);
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setUploadResult(`Ошибка: ${data.error}`);
      } else {
        setUploadResult(
          `Загружено ${data.batch.recordCount} записей (${data.batch.recordsWithSalary} с ЗП) из ${selectedFile.name}`
        );
        setShowMapping(false);
        setSelectedFile(null);
        loadBatches();
      }
    } catch {
      setUploadResult("Ошибка загрузки файла");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteBatch(batchId: string) {
    if (!confirm("Удалить эту загрузку? Записи будут удалены из аналитики.")) return;

    try {
      const res = await fetch(`/api/upload/batches?id=${batchId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadBatches();
      }
    } catch {
      console.error("Failed to delete batch");
    }
  }

  async function handleHuntflowExport() {
    const vacancyIds = exportScope === "selected" ? selectedVacancyIds : [];
    setExporting(true);
    setExportResult(null);
    setExportJob(null);
    try {
      const res = await fetch("/api/huntflow/export/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancyIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExportResult(`Ошибка: ${data.error}`);
        setExporting(false);
        return;
      }
      const job = data.job as HuntflowExportJob;
      setExportJob(job);
      setExportResult(
        vacancyIds.length
          ? `Фоновая выгрузка запущена по выбранным вакансиям: ${vacancyIds.length}. Файл скачается автоматически.`
          : "Фоновая выгрузка запущена по всем вакансиям. Файл скачается автоматически."
      );
      pollHuntflowExport(job.id);
    } catch {
      setExportResult("Ошибка соединения");
      setExporting(false);
    }
  }

  async function pollHuntflowExport(jobId: string) {
    try {
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const res = await fetch(`/api/huntflow/export/jobs/${jobId}`);
        const data = await res.json();
        if (!res.ok) {
          setExportJob(null);
          setExportResult(
            data.error === "Задача не найдена"
              ? "Ошибка: выгрузка была прервана после перезапуска сервера. Запустите выгрузку заново."
              : `Ошибка: ${data.error}`
          );
          setExporting(false);
          return;
        }

        const job = data.job as HuntflowExportJob;
        setExportJob(job);
        if (job.status === "queued" || job.status === "running") {
          setExportResult(job.message || "Фоновая выгрузка выполняется.");
          continue;
        }
        if (job.status === "error") {
          setExportResult(`Ошибка: ${job.error || "Не удалось подготовить выгрузку"}`);
          setExporting(false);
          return;
        }

        const downloadRes = await fetch(`/api/huntflow/export/jobs/${jobId}/download`);
        if (!downloadRes.ok) {
          const downloadError = await downloadRes.json();
          setExportResult(`Ошибка: ${downloadError.error}`);
          setExporting(false);
          return;
        }
        const blob = await downloadRes.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = job.fileName || `huntflow_candidates_llm_clean_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        setExportResult(
          `Выгрузка очищена внутренней LLM и скачана${job.recordCount ? `: ${job.recordCount} записей` : ""}. Теперь загрузите этот файл через блок выше.`
        );
        setExporting(false);
        return;
      }
    } catch {
      setExportResult("Ошибка соединения при проверке фоновой выгрузки");
      setExporting(false);
    }
  }

  const exportProgress =
    exportJob?.progressTotal && exportJob.progressTotal > 0
      ? Math.min(100, Math.round(((exportJob.progressCurrent || 0) / exportJob.progressTotal) * 100))
      : undefined;

  const exportStatusLabel: Record<HuntflowExportJob["status"], string> = {
    queued: "В очереди",
    running: "Идет выгрузка",
    ready: "Готово",
    error: "Ошибка",
  };

  const formatExportDate = (value?: string) =>
    value ? new Date(value).toLocaleString("ru-RU") : "";

  const toggleVacancySelection = (vacancyId: number) => {
    setSelectedVacancyIds((prev) =>
      prev.includes(vacancyId)
        ? prev.filter((id) => id !== vacancyId)
        : [...prev, vacancyId]
    );
  };

  const exportDisabled =
    exporting || (exportScope === "selected" && selectedVacancyIds.length === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>
        <p className="text-gray-500 mt-1">
          Управление источниками данных
        </p>
      </div>

      {/* Загрузка файла */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Загрузка файла
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Загрузите CSV или Excel файл. Столбцы распознаются автоматически.
          Вы сможете переназначить маппинг перед загрузкой.
        </p>

        <label className="inline-block">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          <span className="inline-block bg-gray-100 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-200 cursor-pointer transition-colors">
            Выбрать файл
          </span>
        </label>

        {uploadResult && (
          <p className={`mt-3 text-sm ${uploadResult.startsWith("Ошибка") ? "text-red-600" : "text-green-600"}`}>
            {uploadResult}
          </p>
        )}
      </div>

      {/* Маппинг столбцов */}
      {showMapping && selectedFile && (
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Маппинг столбцов
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Файл: <span className="font-medium">{selectedFile.name}</span> — назначьте столбцы
          </p>

          {/* Поля для цеха, подцеха, стека, отдела, грейда */}
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-600 mb-3">
              Поля ниже определяются автоматически из данных (столбцы файла + словари). Заполните только если хотите переопределить для всех записей.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Цех
              </label>
              <input
                value={workshopOverride}
                onChange={(e) => setWorkshopOverride(e.target.value)}
                placeholder="Авто из данных"
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Подцех
              </label>
              <input
                value={subWorkshopOverride}
                onChange={(e) => setSubWorkshopOverride(e.target.value)}
                placeholder="Например: Backend"
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Стек
              </label>
              <input
                value={techStackOverride}
                onChange={(e) => setTechStackOverride(e.target.value)}
                placeholder="Например: PHP"
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Отдел
              </label>
              <input
                value={departmentOverride}
                onChange={(e) => setDepartmentOverride(e.target.value)}
                placeholder="Например: PHP-разработка"
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Грейд
              </label>
              <input
                value={gradeOverride}
                onChange={(e) => setGradeOverride(e.target.value)}
                placeholder="Например: Middle"
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            </div>
          </div>

          {/* Таблица маппинга */}
          <div className="space-y-2 mb-4">
            <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-500 px-3">
              <span>Столбец в файле</span>
              <span>→</span>
              <span>Поле в системе</span>
            </div>
            {detectedColumns.map((col) => (
              <div key={col} className="grid grid-cols-3 gap-2 items-center px-3 py-2 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-900 truncate">{col}</span>
                <span className="text-gray-400 text-center">→</span>
                <select
                  value={columnMapping[col] || ""}
                  onChange={(e) =>
                    setColumnMapping((prev) => ({
                      ...prev,
                      [col]: e.target.value,
                    }))
                  }
                  className="px-2 py-1.5 border border-border rounded-lg text-sm"
                >
                  <option value="">— не импортировать —</option>
                  {Object.entries(FIELD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? "Загрузка..." : "Загрузить"}
            </button>
            <button
              onClick={() => {
                setShowMapping(false);
                setSelectedFile(null);
              }}
              className="px-6 py-2.5 border border-border rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Выгрузка из Huntflow */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Выгрузка из Huntflow
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Запускает фоновую выгрузку из Huntflow, очищает ФИО через внутреннюю LLM
          http://192.168.153.104:11434 и скачивает Excel без ФИО. После скачивания загрузите файл через блок выше.
        </p>
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setExportScope("all")}
              disabled={exporting}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                exportScope === "all"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
              } disabled:opacity-50`}
            >
              Все вакансии
            </button>
            <button
              type="button"
              onClick={() => {
                setExportScope("selected");
                if (huntflowVacancies.length === 0) void loadHuntflowVacancies();
              }}
              disabled={exporting}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                exportScope === "selected"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
              } disabled:opacity-50`}
            >
              Выбранные вакансии
            </button>
          </div>

          {exportScope === "selected" && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <p className="text-sm text-gray-600">
                  Выбрано: {selectedVacancyIds.length}
                </p>
                <button
                  type="button"
                  onClick={loadHuntflowVacancies}
                  disabled={vacanciesLoading || exporting}
                  className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                >
                  Обновить список
                </button>
              </div>

              {vacanciesLoading ? (
                <p className="text-sm text-gray-500">Загружаем вакансии...</p>
              ) : vacanciesError ? (
                <p className="text-sm text-red-600">{vacanciesError}</p>
              ) : huntflowVacancies.length === 0 ? (
                <p className="text-sm text-gray-500">Вакансии не найдены</p>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                  {huntflowVacancies.map((vacancy) => (
                    <label
                      key={vacancy.id}
                      className="flex items-start gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedVacancyIds.includes(vacancy.id)}
                        onChange={() => toggleVacancySelection(vacancy.id)}
                        disabled={exporting}
                        className="mt-1"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900">
                          {vacancy.name}
                        </span>
                        {vacancy.status && (
                          <span className="block text-xs text-gray-500">
                            {vacancy.status}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleHuntflowExport}
          disabled={exportDisabled}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {exporting ? "Фоновая выгрузка запущена..." : "Скачать выгрузку фоном"}
        </button>
        {exportResult && (
          <p className={`mt-3 text-sm ${exportResult.startsWith("Ошибка") ? "text-red-600" : "text-green-600"}`}>
            {exportResult}
          </p>
        )}
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {exportJob ? exportStatusLabel[exportJob.status] : "Не запущена"}
              </p>
              <p className="text-sm text-gray-600 mt-0.5">
                {exportJob?.error || exportJob?.message || "Готова к запуску"}
              </p>
            </div>
            {exportProgress !== undefined && (
              <p className="text-sm font-medium text-gray-700">
                {exportProgress}%
              </p>
            )}
          </div>

          {exportProgress !== undefined && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all ${
                  exportJob?.status === "error" ? "bg-red-500" : "bg-blue-600"
                }`}
                style={{ width: `${exportProgress}%` }}
              />
            </div>
          )}

          {exportJob && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {exportJob.progressTotal !== undefined && (
                <span>
                  Обработано: {exportJob.progressCurrent || 0} из {exportJob.progressTotal}
                </span>
              )}
              {exportJob.startedAt && <span>Старт: {formatExportDate(exportJob.startedAt)}</span>}
              {exportJob.updatedAt && <span>Обновлено: {formatExportDate(exportJob.updatedAt)}</span>}
            </div>
          )}
        </div>
      </div>

      {/* История загрузок */}
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          История загрузок
        </h2>

        {loading ? (
          <p className="text-gray-500 text-sm">Загрузка...</p>
        ) : batches.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">
            Пока нет загрузок
          </p>
        ) : (
          <div className="space-y-3">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {batch.fileName}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(batch.uploadedAt).toLocaleString("ru-RU")} —{" "}
                    {batch.recordCount} записей ({batch.recordsWithSalary} с ЗП)
                    {batch.departmentOverride && (
                      <span className="ml-2 text-blue-600">
                        Отдел: {batch.departmentOverride}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteBatch(batch.id)}
                  className="text-red-500 text-sm hover:underline ml-4 shrink-0"
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
