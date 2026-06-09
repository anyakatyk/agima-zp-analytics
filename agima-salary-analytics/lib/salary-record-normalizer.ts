import type {
  HuntflowApplicant,
  HuntflowComment,
  HuntflowVacancy,
  SalaryRecord,
} from "./types";
import { matchSubWorkshop, matchWorkshop } from "./dictionaries";
import { parseSalary, parseStructuredSalary } from "./salary-parser";

export const AUTO_COLUMN_MAP: Record<string, string> = {
  id: "id",
  ид: "id",
  фио: "fullName",
  имя: "fullName",
  "full name": "fullName",
  name: "fullName",
  кандидат: "fullName",
  должность: "position",
  позиция: "position",
  position: "position",
  "текущая должность": "position",
  вакансия: "vacancyName",
  "название вакансии": "vacancyName",
  vacancy: "vacancyName",
  отдел: "workshop",
  department: "workshop",
  цех: "workshop",
  workshop: "workshop",
  подразделение: "subWorkshop",
  подцех: "subWorkshop",
  "sub-workshop": "subWorkshop",
  subworkshop: "subWorkshop",
  стек: "techStack",
  stack: "techStack",
  "tech stack": "techStack",
  грейд: "grade",
  grade: "grade",
  уровень: "grade",
  зп: "salaryRaw",
  зарплата: "salaryRaw",
  salary: "salaryRaw",
  "salary from": "salaryFrom",
  "salary to": "salaryTo",
  комментарий: "commentExcerpt",
  comment: "commentExcerpt",
  примечание: "commentExcerpt",
  дата: "createdAt",
  date: "createdAt",
  "дата добавления": "createdAt",
  "дата выгрузки": "createdAt",
  "дата рождения": "birthDate",
  статус: "status",
  status: "status",
  "текущий этап подбора": "status",
  "последнее место работы": "lastWorkplace",
  "место работы": "lastWorkplace",
};

type RowRecordOptions = {
  departmentOverride?: string;
  workshopOverride?: string;
  subWorkshopOverride?: string;
  techStackOverride?: string;
  gradeOverride?: string;
};

type HuntflowNormalizeOptions = {
  vacancy?: HuntflowVacancy;
  vacancyId?: number;
  vacancyStatusNames?: Record<string, string>;
  exportDate?: string;
};

export function autoDetectColumns(headers: string[]): {
  mapping: Record<string, string>;
  unmapped: string[];
} {
  const mapping: Record<string, string> = {};
  const unmapped: string[] = [];
  const sortedKeys = Object.keys(AUTO_COLUMN_MAP).sort((a, b) => b.length - a.length);

  for (const header of headers) {
    const normalized = normalizeText(header).replace(/\s+/g, " ");
    let matched = false;

    const exactField = AUTO_COLUMN_MAP[normalized];
    if (exactField) {
      mapping[header] = exactField;
      matched = true;
    }

    if (!matched) {
      for (const key of sortedKeys) {
        if (normalized.includes(key) || key.includes(normalized)) {
          mapping[header] = AUTO_COLUMN_MAP[key];
          matched = true;
          break;
        }
      }
    }

    if (!matched) unmapped.push(header);
  }

  return { mapping, unmapped };
}

export async function rowToSalaryRecord(
  row: Record<string, string>,
  columnMapping: Record<string, string>,
  options: RowRecordOptions,
  index: number
): Promise<SalaryRecord> {
  const fields: Record<string, string> = {};
  for (const [sourceColumn, targetField] of Object.entries(columnMapping)) {
    fields[targetField] = stringifyValue(row[sourceColumn]);
  }

  const rawId = fields.id?.trim() || "";
  const recordId = rawId ? `upload-${rawId}` : `upload-${Date.now()}-${index}`;
  const position = fields.position?.trim() || "";
  const vacancyName = fields.vacancyName?.trim() || position || "";

  const workshop = resolveWorkshop(
    fields.workshop,
    options.workshopOverride,
    position,
    vacancyName
  );
  const subWorkshop = resolveSubWorkshop(
    fields.subWorkshop,
    options.subWorkshopOverride,
    position,
    vacancyName
  );

  const salaryText = fields.salaryRaw || "";
  let parsed = await parseSalary(salaryText);
  if (!parsed) {
    parsed = await parseSalaryRange(fields.salaryFrom, fields.salaryTo);
  }

  return {
    id: recordId,
    fullName: fields.fullName?.trim() || undefined,
    position,
    workshop,
    subWorkshop,
    techStack: fields.techStack?.trim() || options.techStackOverride || "",
    department: fields.department?.trim() || options.departmentOverride || workshop,
    grade: fields.grade?.trim() || options.gradeOverride || "",
    vacancyName,
    salaryFrom: parsed?.from ?? null,
    salaryTo: parsed?.to ?? null,
    salaryCurrency: "RUB",
    salarySource: parsed ? "field" : "none",
    rawSalaryText: salaryText || parsed?.raw || null,
    commentExcerpt: fields.commentExcerpt || undefined,
    status: fields.status?.trim() || "new",
    birthDate: fields.birthDate?.trim() || undefined,
    lastWorkplace: fields.lastWorkplace?.trim() || undefined,
    createdAt: parseDateToIso(fields.createdAt),
    updatedAt: new Date().toISOString(),
  };
}

export async function huntflowToSalaryRecord(
  applicant: HuntflowApplicant,
  comments: HuntflowComment[],
  options: HuntflowNormalizeOptions = {}
): Promise<SalaryRecord> {
  const vacancy = options.vacancy;
  const vacancyId = options.vacancyId ?? vacancy?.id;
  const vacancyName = getVacancyName(vacancy) || applicant.position || "";
  const lastWorkplace = stringifyValue(applicant.company || applicant.experience);
  const rawSalary = getRawSalaryText(applicant);
  const structured = await parseHuntflowStructuredSalary(applicant);

  let salaryFrom = structured?.from ?? null;
  let salaryTo = structured?.to ?? null;
  let salarySource: "field" | "comment" | "none" = structured ? "field" : "none";
  let rawSalaryText: string | null = rawSalary || null;
  let commentExcerpt: string | undefined;

  if (!structured && rawSalary) {
    const parsed = await parseSalary(rawSalary);
    if (parsed) {
      salaryFrom = parsed.from;
      salaryTo = parsed.to;
      salarySource = "field";
      rawSalaryText = parsed.raw;
    }
  }

  if (salarySource === "none" && comments.length > 0) {
    for (const comment of comments) {
      if (!comment.text) continue;
      const parsed = await parseSalary(comment.text);
      if (parsed) {
        salaryFrom = parsed.from;
        salaryTo = parsed.to;
        salarySource = "comment";
        rawSalaryText = parsed.raw;
        commentExcerpt = comment.text.slice(0, 200);
        break;
      }
    }
  }

  const workshop = resolveWorkshop(
    getNamedField(vacancy, ["отдел", "цех", "department"]) || getVacancyDivision(vacancy),
    undefined,
    applicant.position,
    vacancyName
  );
  const subWorkshop = resolveSubWorkshop(
    getNamedField(vacancy, ["подразделение", "подцех", "subdivision"]),
    undefined,
    applicant.position,
    vacancyName
  );

  return {
    id: vacancyId ? `hf-${applicant.id}-vacancy-${vacancyId}` : `hf-${applicant.id}`,
    huntflowId: applicant.id,
    fullName: undefined,
    position: applicant.position || "",
    workshop,
    subWorkshop,
    techStack: getNamedField(vacancy, ["стек", "stack", "tech stack"]),
    department: workshop,
    grade: getNamedField(vacancy, ["грейд", "grade", "уровень"]),
    vacancyId: vacancyId ? String(vacancyId) : undefined,
    vacancyName,
    salaryFrom,
    salaryTo,
    salaryCurrency: "RUB",
    salarySource,
    rawSalaryText,
    commentExcerpt,
    status: getCurrentStatus(applicant, vacancyId, options.vacancyStatusNames),
    birthDate: applicant.birthday || applicant.birth_date || undefined,
    lastWorkplace: lastWorkplace || undefined,
    createdAt: parseDateToIso(options.exportDate || applicant.created),
    updatedAt: parseDateToIso(applicant.updated) || new Date().toISOString(),
  };
}

async function parseSalaryRange(
  salaryFrom?: string,
  salaryTo?: string
): Promise<{ from: number | null; to: number | null; currency: string; raw: string } | null> {
  const fromText = salaryFrom?.trim();
  const toText = salaryTo?.trim();
  if (!fromText) return null;

  const fromParsed = await parseSalary(fromText);
  if (!fromParsed) return null;

  const toParsed = toText ? await parseSalary(toText) : null;
  return {
    from: fromParsed.from,
    to: toParsed?.to ?? fromParsed.to,
    currency: "RUB",
    raw: fromText + (toText ? ` - ${toText}` : ""),
  };
}

async function parseHuntflowStructuredSalary(
  applicant: HuntflowApplicant
): Promise<{ from: number; to: number } | null> {
  const salary = applicant.salary;
  if (typeof salary === "number") {
    return parseStructuredSalary(salary, applicant.salaryCurrency);
  }
  if (typeof salary === "string") {
    const parsed = await parseSalary(salary);
    return parsed?.from ? { from: parsed.from, to: parsed.to ?? parsed.from } : null;
  }
  if (salary && typeof salary === "object") {
    const amount = salary.amount ?? salary.money ?? salary.value;
    const currencyValue = salary.currency;
    const currency =
      typeof currencyValue === "object"
        ? currencyValue.code || currencyValue.name
        : currencyValue || salary.currency_code;
    const numericAmount = Number(amount);
    if (!Number.isNaN(numericAmount)) {
      return parseStructuredSalary(numericAmount, currency);
    }
  }
  const money = Number(applicant.money);
  if (!Number.isNaN(money)) {
    return parseStructuredSalary(money, applicant.salaryCurrency);
  }
  return null;
}

function resolveWorkshop(
  value: string | undefined,
  override: string | undefined,
  position?: string,
  vacancyName?: string
): string {
  const direct = value?.trim() || override || "";
  if (direct) return direct;
  const matched = matchWorkshop([position, vacancyName].filter(Boolean).join(" "));
  return matched?.name || "";
}

function resolveSubWorkshop(
  value: string | undefined,
  override: string | undefined,
  position?: string,
  vacancyName?: string
): string {
  const direct = value?.trim() || override || "";
  if (direct) return direct;
  const matched = matchSubWorkshop([position, vacancyName].filter(Boolean).join(" "));
  return matched?.name || "";
}

function getVacancyName(vacancy?: HuntflowVacancy): string {
  if (!vacancy) return "";
  return vacancy.position || vacancy.name || vacancy.title || "";
}

function getRawSalaryText(applicant: HuntflowApplicant): string {
  if (applicant.money) return String(applicant.money);
  if (typeof applicant.salary === "string" || typeof applicant.salary === "number") {
    return String(applicant.salary);
  }
  if (applicant.salary && typeof applicant.salary === "object") {
    const amount = applicant.salary.amount ?? applicant.salary.money ?? applicant.salary.value;
    const currencyValue = applicant.salary.currency;
    const currency =
      typeof currencyValue === "object"
        ? currencyValue.code || currencyValue.name
        : currencyValue || applicant.salary.currency_code;
    return [amount, currency].filter((part) => part !== undefined && part !== "").join(" ");
  }
  return "";
}

function getCurrentStatus(
  applicant: HuntflowApplicant,
  vacancyId?: number,
  statusNames: Record<string, string> = {}
): string {
  const links = asArray(applicant.links || applicant.vacancies);
  for (const link of links) {
    const linkedVacancy = getRecordId(link.vacancy) || getRecordId(link.vacancy_id);
    if (vacancyId && linkedVacancy && linkedVacancy !== String(vacancyId)) continue;

    const status = link.status ?? link.vacancy_status;
    const normalized = normalizeStatus(status, statusNames);
    if (normalized) return normalized;
  }

  return (
    normalizeStatus(applicant.vacancy_status, statusNames) ||
    normalizeStatus(applicant.status, statusNames) ||
    "new"
  );
}

function normalizeStatus(
  status: unknown,
  statusNames: Record<string, string>
): string {
  if (!status) return "";
  if (typeof status === "object") {
    const item = status as Record<string, unknown>;
    return stringifyValue(item.name || item.title || item.id);
  }
  return statusNames[String(status)] || String(status);
}

function getVacancyDivision(vacancy?: HuntflowVacancy): string {
  if (!vacancy) return "";
  if (vacancy.company) return String(vacancy.company);
  const division = vacancy.account_division || vacancy.division;
  if (division && typeof division === "object") {
    return stringifyValue(division.name || division.title || division.id);
  }
  return stringifyValue(division);
}

function getNamedField(data: unknown, aliases: string[]): string {
  const normalizedAliases = aliases.map(normalizeText);
  for (const item of flattenRecords(data)) {
    for (const [key, value] of Object.entries(item)) {
      if (["values", "items", "fields"].includes(key) && Array.isArray(value)) {
        const nested = getNamedField(value, aliases);
        if (nested) return nested;
      }
      if (["name", "title", "label"].includes(key) && matchesAlias(value, normalizedAliases)) {
        const fieldValue = item.value || item.text || item.display_value || item.selected;
        if (fieldValue !== undefined && fieldValue !== null && fieldValue !== "") {
          return stringifyValue(fieldValue);
        }
      }
      if (matchesAlias(key, normalizedAliases) && value !== undefined && value !== null && value !== "") {
        return stringifyValue(value);
      }
    }
  }
  return "";
}

function* flattenRecords(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) yield* flattenRecords(item);
    return;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    yield record;
    for (const nested of Object.values(record)) {
      yield* flattenRecords(nested);
    }
  }
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function getRecordId(value: unknown): string {
  if (value && typeof value === "object") {
    return stringifyValue((value as Record<string, unknown>).id);
  }
  return stringifyValue(value);
}

function matchesAlias(value: unknown, normalizedAliases: string[]): boolean {
  const text = normalizeText(value);
  return normalizedAliases.some((alias) => alias === text || alias.includes(text) || text.includes(alias));
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace("ё", "е");
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    return value.map(stringifyValue).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    return stringifyValue(item.name || item.title || item.value || item.id);
  }
  return String(value);
}

function parseDateToIso(value?: string): string {
  if (!value?.trim()) return "";
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? value.trim() : parsed.toISOString();
}
