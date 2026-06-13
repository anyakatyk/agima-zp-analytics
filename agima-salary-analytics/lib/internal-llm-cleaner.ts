import type { HuntflowRawExportRow } from "./huntflow-client";

export type CleanHuntflowExportRow = {
  rowIndex: number;
  lastWorkplace: string;
  position: string;
  salary: string;
  birthDate: string;
  status: string;
  vacancyName: string;
  grade: string;
  workshop: string;
  subWorkshop: string;
  date: string;
};

const INTERNAL_LLM_BASE_URL =
  process.env.INTERNAL_LLM_BASE_URL ||
  process.env.LLM_BASE_URL ||
  "http://192.168.153.104:11434";
const INTERNAL_LLM_MODEL =
  process.env.INTERNAL_LLM_MODEL ||
  process.env.LLM_MODEL ||
  "llama3.1:8b";
const BATCH_SIZE = 10;
const LLM_TIMEOUT_MS = 60_000;
const LLM_MAX_ATTEMPTS = 2;
const FORBIDDEN_KEYS = new Set([
  "fullName",
  "fio",
  "ФИО",
  "name",
  "candidate",
  "кандидат",
  "имя",
  "фамилия",
]);

export async function cleanHuntflowRowsWithInternalLlm(
  rows: HuntflowRawExportRow[],
  onProgress?: (progress: { current: number; total: number }) => void
): Promise<CleanHuntflowExportRow[]> {
  const cleaned: CleanHuntflowExportRow[] = [];

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    cleaned.push(...await cleanBatch(batch));
    onProgress?.({ current: cleaned.length, total: rows.length });
  }

  return cleaned.sort((a, b) => a.rowIndex - b.rowIndex);
}

export function removePersonalDataWithoutLlm(
  rows: HuntflowRawExportRow[]
): CleanHuntflowExportRow[] {
  return rows
    .map((row) => ({
      rowIndex: row.rowIndex,
      lastWorkplace: row.lastWorkplace || "",
      position: row.position || "",
      salary: row.salary || "",
      birthDate: row.birthDate || "",
      status: row.status || "",
      vacancyName: row.vacancyName || "",
      grade: row.grade || "",
      workshop: row.workshop || "",
      subWorkshop: row.subWorkshop || "",
      date: row.date || "",
    }))
    .sort((a, b) => a.rowIndex - b.rowIndex);
}

async function cleanBatch(
  rows: HuntflowRawExportRow[]
): Promise<CleanHuntflowExportRow[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= LLM_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await callInternalLlm(rows, attempt);
      const parsed = parseLlmJson(response);
      const cleanedRows = extractRows(parsed);

      if (!Array.isArray(cleanedRows)) {
        throw new Error("Внутренняя LLM вернула JSON без массива rows.");
      }

      if (cleanedRows.length !== rows.length) {
        throw new Error(
          `Внутренняя LLM вернула ${cleanedRows.length} строк, ожидалось ${rows.length}.`
        );
      }

      return cleanedRows.map(validateCleanRow);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Ошибка внутренней LLM");
    }
  }

  throw lastError || new Error("Внутренняя LLM не смогла очистить строки.");
}

async function callInternalLlm(
  rows: HuntflowRawExportRow[],
  attempt: number
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const res = await fetch(`${INTERNAL_LLM_BASE_URL}/api/generate`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: INTERNAL_LLM_MODEL,
        stream: false,
        format: "json",
        prompt: buildPrompt(rows, attempt),
      }),
    });

    if (!res.ok) {
      const details = await res.text();
      throw new Error(
        `Internal LLM error: ${res.status} ${res.statusText}${details ? `: ${details.slice(0, 500)}` : ""}`
      );
    }

    const data = await res.json();
    if (!data.response || typeof data.response !== "string") {
      throw new Error("Internal LLM returned empty response.");
    }
    return data.response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Internal LLM timeout after ${LLM_TIMEOUT_MS / 1000}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(rows: HuntflowRawExportRow[], attempt: number): string {
  return [
    "Ты внутренняя локальная LLM для очистки персональных данных перед передачей данных в сервис аналитики.",
    "Тебе передан JSON-массив строк Huntflow. В каждой строке может быть поле fullName с ФИО кандидата.",
    "Верни строго JSON без markdown.",
    "Верни ровно один JSON-объект вида {\"rows\":[...]}",
    `В массиве rows должно быть ровно ${rows.length} объектов — по одному на каждую входную строку.`,
    "В каждой строке результата должны быть только эти ключи:",
    "rowIndex, lastWorkplace, position, salary, birthDate, status, vacancyName, grade, workshop, subWorkshop, date.",
    "Полностью удали fullName, ФИО, имя, фамилию и любые поля с персональными именами.",
    "Не добавляй новые сведения. Не меняй зарплату, даты, вакансию, грейд, цех и подцех.",
    "Если поле пустое, верни пустую строку.",
    attempt > 1
      ? "Повторная попытка: предыдущий ответ был неверного формата. Не возвращай объект одной строки, текст, пояснения или другой ключ вместо rows."
      : "",
    "",
    JSON.stringify(rows),
  ].join("\n");
}

function parseLlmJson(value: string): { rows?: unknown[] } | unknown[] {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("Internal LLM response is not JSON.");
    return JSON.parse(match[0]);
  }
}

function extractRows(value: { rows?: unknown[] } | unknown[]): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const directKeys = ["rows", "data", "items", "result", "records"];
  for (const key of directKeys) {
    if (Array.isArray(record[key])) return record[key];
  }

  for (const nestedValue of Object.values(record)) {
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      const nestedRows = extractRows(nestedValue as { rows?: unknown[] });
      if (nestedRows) return nestedRows;
    }
  }

  return undefined;
}

function validateCleanRow(value: unknown): CleanHuntflowExportRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Internal LLM returned a non-object row.");
  }

  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Internal LLM returned forbidden personal-data key: ${key}.`);
    }
  }

  return {
    rowIndex: asNumber(row.rowIndex),
    lastWorkplace: asString(row.lastWorkplace),
    position: asString(row.position),
    salary: asString(row.salary),
    birthDate: asString(row.birthDate),
    status: asString(row.status),
    vacancyName: asString(row.vacancyName),
    grade: asString(row.grade),
    workshop: asString(row.workshop),
    subWorkshop: asString(row.subWorkshop),
    date: asString(row.date),
  };
}

function asString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function asNumber(value: unknown): number {
  const number = Number(value);
  if (Number.isNaN(number)) {
    throw new Error("Internal LLM returned row without numeric rowIndex.");
  }
  return number;
}
