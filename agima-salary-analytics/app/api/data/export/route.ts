import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME, getUserFromPayload } from "@/lib/auth";
import { dataStore } from "@/lib/data-store";
import { DataAccessLayer } from "@/lib/security/data-access-layer";
import { logAuditEvent } from "@/lib/security/audit-log";
import { maskFullName } from "@/lib/security/data-masking";
import type { FilterState } from "@/lib/types";
import ExcelJS from "exceljs";

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

  const filters: FilterState = {
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
    vacancyId: searchParams.get("vacancyId"),
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
  summarySheet.addRow({ metric: "Фильтры", value: JSON.stringify(filters) });

  // Лист 2: Кандидаты
  const candidatesSheet = workbook.addWorksheet("Кандидаты");
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

  // Стиль заголовков
  [summarySheet, candidatesSheet].forEach((sheet) => {
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
    details: `Экспорт ${records.length} записей`,
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
