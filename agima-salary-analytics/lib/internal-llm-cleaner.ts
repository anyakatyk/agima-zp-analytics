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
const BATCH_SIZE = 20;
const LLM_TIMEOUT_MS = 60_000;
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

async function cleanBatch(
  rows: HuntflowRawExportRow[]
): Promise<CleanHuntflowExportRow[]> {
  const response = await callInternalLlm(rows);
  const parsed = parseLlmJson(response);
  const cleanedRows = Array.isArray(parsed) ? parsed : parsed.rows;

  if (!Array.isArray(cleanedRows)) {
    throw new Error("Internal LLM returned JSON without rows array.");
  }

  if (cleanedRows.length !== rows.length) {
    throw new Error(
      `Internal LLM returned ${cleanedRows.length} rows, expected ${rows.length}.`
    );
  }

  return cleanedRows.map(validateCleanRow);
}

async function callInternalLlm(rows: HuntflowRawExportRow[]): Promise<string> {
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
        prompt: buildPrompt(rows),
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

function buildPrompt(rows: HuntflowRawExportRow[]): string {
  return [
    "Ты внутренняя локальная LLM для очистки персональных данных перед передачей данных в сервис аналитики.",
    "Тебе передан JSON-массив строк Huntflow. В каждой строке может быть поле fullName с ФИО кандидата.",
    "Верни строго JSON без markdown.",
    "Верни объект вида {\"rows\":[...]}",
    "В каждой строке результата должны быть только эти ключи:",
    "rowIndex, lastWorkplace, position, salary, birthDate, status, vacancyName, grade, workshop, subWorkshop, date.",
    "Полностью удали fullName, ФИО, имя, фамилию и любые поля с персональными именами.",
    "Не добавляй новые сведения. Не меняй зарплату, даты, вакансию, грейд, цех и подцех.",
    "Если поле пустое, верни пустую строку.",
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
