import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME, getUserFromPayload } from "@/lib/auth";
import { dataStore } from "@/lib/data-store";
import { DataAccessLayer } from "@/lib/security/data-access-layer";
import { logAuditEvent } from "@/lib/security/audit-log";
import { maskFullName } from "@/lib/security/data-masking";
import type { FilterState } from "@/lib/types";
import ExcelJS from "exceljs";

const execFileAsync = promisify(execFile);
const WORKSPACE_ROOT = path.resolve(process.cwd(), "..");
const DEFAULT_PYTHON_BIN =
  "/Users/ashabaeva/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const PYTHON_BIN = process.env.PYTHON_BIN || DEFAULT_PYTHON_BIN;

type HhSnapshotExport = {
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
  search_name?: string | null;
  summary?: {
    observations: number;
    median: number | null;
    average: number | null;
    min: number | null;
    max: number | null;
  } | null;
};

type HhGroupExport = {
  group_type: string;
  group_value: string;
  observations_count: number;
  salary_min: number | null;
  salary_median: number | null;
  salary_avg: number | null;
  salary_max: number | null;
};

async function runPythonJson<T>(args: string[]): Promise<T> {
  const { stdout } = await execFileAsync(PYTHON_BIN, args, {
    cwd: WORKSPACE_ROOT,
    timeout: 180_000,
    maxBuffer: 1024 * 1024 * 8,
  });
  return JSON.parse(stdout.trim() || "{}") as T;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const user = getUserFromPayload(payload);
  const { searchParams } = request.nextUrl;
  const includeBase = searchParams.get("includeBase") !== "false";
  const includeHh = searchParams.get("includeHh") === "true";
  const role = searchParams.get("role");

  const filters: FilterState = {
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
    vacancyId: searchParams.get("vacancyId") || role,
    department: searchParams.get("department"),
    workshop: searchParams.get("workshop"),
    subWorkshop: searchParams.get("subWorkshop"),
    techStack: searchParams.get("techStack"),
    grade: searchParams.get("grade"),
    birthDateFrom: searchParams.get("birthDateFrom"),
    birthDateTo: searchParams.get("birthDateTo"),
    showOnlyWithSalary: searchParams.get("onlyWithSalary") === "true",
  };

  const dal = new DataAccessLayer(
    () => dataStore.getAll(),
    (f) => dataStore.getStats(f)
  );

  const records = dal.exportData(user, filters, "xlsx");
  let hhSnapshots: HhSnapshotExport[] = [];
  let hhGroups: HhGroupExport[] = [];

  if (includeHh) {
    const hhArgs = ["hh_searches.py", "list", "--limit", "1000"];
    const hhGroupsArgs = ["hh_searches.py", "groups", "--group-type", searchParams.get("hhGroupType") || "role"];
    for (const [key, cli] of [
      ["role", "--role"],
      ["workshop", "--workshop"],
      ["subWorkshop", "--sub-workshop"],
      ["grade", "--grade"],
      ["techStack", "--stack"],
      ["dateFrom", "--from-date"],
      ["dateTo", "--to-date"],
    ] as const) {
      const value = searchParams.get(key);
      if (value) {
        hhArgs.push(cli, value);
        hhGroupsArgs.push(cli, value);
      }
    }
    const hhData = await runPythonJson<{ snapshots: HhSnapshotExport[] }>(hhArgs);
    const hhGroupData = await runPythonJson<{ groups: HhGroupExport[] }>(hhGroupsArgs);
    hhSnapshots = hhData.snapshots || [];
    hhGroups = hhGroupData.groups || [];
  }

  // Генерируем Excel
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  // Лист 1: Сводка
  const summarySheet = workbook.addWorksheet("Сводка");
  summarySheet.columns = [
    { header: "Метрика", key: "metric", width: 30 },
    { header: "Значение", key: "value", width: 20 },
  ];
  const stats = dataStore.getStats(filters);
  summarySheet.addRow({ metric: "Всего кандидатов", value: stats.count });
  summarySheet.addRow({ metric: "С указанной ЗП", value: stats.countWithSalary });
  summarySheet.addRow({ metric: "Без ЗП", value: stats.countWithoutSalary });
  summarySheet.addRow({ metric: "Средняя ЗП", value: `${stats.averageSalary} руб.` });
  summarySheet.addRow({ metric: "Медианная ЗП", value: `${stats.medianSalary} руб.` });
  summarySheet.addRow({ metric: "Мин. ЗП", value: `${stats.minSalary} руб.` });
  summarySheet.addRow({ metric: "Макс. ЗП", value: `${stats.maxSalary} руб.` });
  summarySheet.addRow({ metric: "Дата выгрузки", value: new Date().toLocaleDateString("ru-RU") });
  summarySheet.addRow({ metric: "Источники", value: `${includeBase ? "База" : ""}${includeBase && includeHh ? " + " : ""}${includeHh ? "HH" : ""}` });
  summarySheet.addRow({ metric: "Фильтры", value: JSON.stringify(filters) });

  // Лист 2: Кандидаты
  const sheetsToStyle = [summarySheet];
  let exportedRows = 0;

  if (includeBase) {
    const candidatesSheet = workbook.addWorksheet("База");
    sheetsToStyle.push(candidatesSheet);
    candidatesSheet.columns = [
      { header: "ФИО", key: "name", width: 25 },
      { header: "Должность", key: "position", width: 25 },
      { header: "Цех", key: "workshop", width: 20 },
      { header: "Подцех", key: "subWorkshop", width: 20 },
      { header: "Стек", key: "techStack", width: 15 },
      { header: "Отдел", key: "department", width: 20 },
      { header: "Грейд", key: "grade", width: 10 },
      { header: "Вакансия", key: "vacancy", width: 25 },
      { header: "ЗП от", key: "salaryFrom", width: 15 },
      { header: "ЗП до", key: "salaryTo", width: 15 },
      { header: "Источник ЗП", key: "source", width: 15 },
      { header: "Статус", key: "status", width: 15 },
      { header: "Дата рождения", key: "birthDate", width: 15 },
      { header: "Последнее место работы", key: "lastWorkplace", width: 25 },
      { header: "Дата добавления", key: "created", width: 15 },
    ];

    for (const r of records) {
      const displayName = r.fullName
        ? user.role === "manager"
          ? maskFullName(r.fullName)
          : r.fullName
        : `Кандидат #${r.id}`;
      candidatesSheet.addRow({
        name: displayName,
        position: r.position,
        workshop: r.workshop,
        subWorkshop: r.subWorkshop,
        techStack: r.techStack,
        department: r.department,
        grade: r.grade,
        vacancy: r.vacancyName,
        salaryFrom: r.salaryFrom,
        salaryTo: r.salaryTo,
        source:
          r.salarySource === "field"
            ? "Поле"
            : r.salarySource === "comment"
              ? "Комментарий"
              : "Не указана",
        status: r.status,
        birthDate: r.birthDate || "—",
        lastWorkplace: r.lastWorkplace || "—",
        created: r.createdAt ? new Date(r.createdAt).toLocaleDateString("ru-RU") : "—",
      });
    }
    exportedRows += records.length;
  }

  if (includeHh) {
    const hhSheet = workbook.addWorksheet("HH снимки");
    sheetsToStyle.push(hhSheet);
    hhSheet.columns = [
      { header: "Снимок", key: "id", width: 12 },
      { header: "Дата", key: "created", width: 16 },
      { header: "Роль", key: "role", width: 25 },
      { header: "Цех", key: "workshop", width: 20 },
      { header: "Подцех", key: "subWorkshop", width: 20 },
      { header: "Грейд", key: "grade", width: 12 },
      { header: "Стек", key: "stack", width: 20 },
      { header: "Резюме", key: "count", width: 12 },
      { header: "Медиана", key: "median", width: 14 },
      { header: "Средняя", key: "average", width: 14 },
      { header: "Мин", key: "min", width: 14 },
      { header: "Макс", key: "max", width: 14 },
    ];
    for (const item of hhSnapshots) {
      hhSheet.addRow({
        id: item.id,
        created: item.created_at ? new Date(item.created_at).toLocaleDateString("ru-RU") : "—",
        role: item.role,
        workshop: item.workshop || "—",
        subWorkshop: item.sub_workshop || "—",
        grade: item.grade,
        stack: item.stack || "—",
        count: item.summary?.observations || 0,
        median: item.summary?.median || "",
        average: item.summary?.average || "",
        min: item.summary?.min || "",
        max: item.summary?.max || "",
      });
    }

    const hhGroupsSheet = workbook.addWorksheet("HH группы");
    sheetsToStyle.push(hhGroupsSheet);
    hhGroupsSheet.columns = [
      { header: "Разрез", key: "type", width: 20 },
      { header: "Значение", key: "value", width: 24 },
      { header: "Резюме", key: "count", width: 12 },
      { header: "Медиана", key: "median", width: 14 },
      { header: "Средняя", key: "average", width: 14 },
      { header: "Мин", key: "min", width: 14 },
      { header: "Макс", key: "max", width: 14 },
    ];
    for (const item of hhGroups) {
      hhGroupsSheet.addRow({
        type: item.group_type,
        value: item.group_value,
        count: item.observations_count,
        median: item.salary_median || "",
        average: item.salary_avg || "",
        min: item.salary_min || "",
        max: item.salary_max || "",
      });
    }
    exportedRows += hhSnapshots.length;
  }

  // Стиль заголовков
  sheetsToStyle.forEach((sheet) => {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" },
    };
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  // Буфер для скачивания
  const buffer = await workbook.xlsx.writeBuffer();

  logAuditEvent({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: "export_excel",
    details: `Экспорт ${exportedRows} записей`,
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="salary-report-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
