import { HuntflowClient } from "./huntflow-client";
import type { HuntflowRawExportRow } from "./huntflow-client";
import {
  removePersonalDataWithoutLlm,
  type CleanHuntflowExportRow,
} from "./internal-llm-cleaner";
import ExcelJS from "exceljs";

const EXPORT_COLUMNS: Array<{ header: string; key: keyof CleanHuntflowExportRow }> = [
  { header: "Последнее место работы", key: "lastWorkplace" },
  { header: "Должность", key: "position" },
  { header: "Зарплата", key: "salary" },
  { header: "Дата рождения", key: "birthDate" },
  { header: "Текущий этап подбора", key: "status" },
  { header: "Название вакансии", key: "vacancyName" },
  { header: "Грейд", key: "grade" },
  { header: "Цех", key: "workshop" },
  { header: "Подцех", key: "subWorkshop" },
  { header: "Дата", key: "date" },
];

export type CleanHuntflowWorkbook = {
  buffer: Buffer;
  fileName: string;
  recordCount: number;
};

export type CleanHuntflowProgress = {
  stage: string;
  message: string;
  current?: number;
  total?: number;
};

export async function buildCleanHuntflowWorkbook(params: {
  token?: string;
  accountId?: number;
  refreshAccessToken?: () => Promise<string>;
  vacancyIds?: number[];
  rawRows?: HuntflowRawExportRow[];
  onProgress?: (progress: CleanHuntflowProgress) => void;
}): Promise<CleanHuntflowWorkbook> {
  const vacancyCount = params.vacancyIds?.length || 0;
  let rawRows = params.rawRows;

  if (!rawRows) {
    if (!params.token || !params.accountId) {
      throw new Error("Huntflow export source is not configured");
    }

    const client = new HuntflowClient(params.token, params.accountId, {
      refreshAccessToken: params.refreshAccessToken,
    });
    params.onProgress?.({
      stage: "huntflow",
      message: vacancyCount
        ? `Загружаем кандидатов по выбранным вакансиям: ${vacancyCount}`
        : "Загружаем кандидатов и вакансии из Huntflow",
    });
    rawRows = await client.collectRawExportRowsForInternalLlm({
      vacancyIds: params.vacancyIds,
      onProgress: (progress) => {
        params.onProgress?.({
          stage: "huntflow",
          message: progress.message,
          current: progress.current,
          total: progress.total,
        });
      },
    });
  }
  params.onProgress?.({
    stage: "excel",
    message: "Удаляем персональные поля и собираем Excel",
    current: rawRows.length,
    total: rawRows.length,
  });
  const records: CleanHuntflowExportRow[] = removePersonalDataWithoutLlm(rawRows);
  params.onProgress?.({
    stage: "excel",
    message: "Собираем Excel без ФИО",
    current: records.length,
    total: records.length,
  });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Очищенная выгрузка");

  sheet.columns = EXPORT_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.header.length < 14 ? 18 : 28,
  }));

  for (const record of records) {
    sheet.addRow({
      lastWorkplace: record.lastWorkplace || "",
      position: record.position || "",
      salary: record.salary || "",
      birthDate: record.birthDate || "",
      status: record.status || "",
      vacancyName: record.vacancyName || "",
      grade: record.grade || "",
      workshop: record.workshop || "",
      subWorkshop: record.subWorkshop || "",
      date: record.date || "",
    });
  }

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E79" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: EXPORT_COLUMNS.length },
  };

  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    fileName: `huntflow_candidates_llm_clean_${date}.xlsx`,
    recordCount: records.length,
  };
}
