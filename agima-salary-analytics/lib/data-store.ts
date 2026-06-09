import type { SalaryRecord, FilterState, SalaryStats } from "./types";
import { getAllRecords } from "./upload-batches";

/**
 * Получает все записи из всех загрузок
 */
function getAll(): SalaryRecord[] {
  return getAllRecords();
}

/**
 * Фильтрует записи по параметрам
 */
function getFiltered(filters: FilterState): SalaryRecord[] {
  let result = getAll();

  if (filters.dateFrom) {
    result = result.filter((r) => r.createdAt && r.createdAt >= filters.dateFrom!);
  }
  if (filters.dateTo) {
    result = result.filter((r) => r.createdAt && r.createdAt <= filters.dateTo!);
  }
  if (filters.vacancyId) {
    result = result.filter((r) => r.vacancyName === filters.vacancyId);
  }
  if (filters.department) {
    result = result.filter(
      (r) =>
        r.department.toLowerCase() ===
        filters.department!.toLowerCase()
    );
  }
  if (filters.workshop) {
    result = result.filter(
      (r) =>
        r.workshop.toLowerCase() ===
        filters.workshop!.toLowerCase()
    );
  }
  if (filters.subWorkshop) {
    result = result.filter(
      (r) =>
        r.subWorkshop.toLowerCase() ===
        filters.subWorkshop!.toLowerCase()
    );
  }
  if (filters.techStack) {
    result = result.filter(
      (r) =>
        r.techStack.toLowerCase() ===
        filters.techStack!.toLowerCase()
    );
  }
  if (filters.grade) {
    result = result.filter(
      (r) =>
        r.grade.toLowerCase() ===
        filters.grade!.toLowerCase()
    );
  }
  if (filters.birthDateFrom) {
    result = result.filter(
      (r) => r.birthDate && r.birthDate >= filters.birthDateFrom!
    );
  }
  if (filters.birthDateTo) {
    result = result.filter(
      (r) => r.birthDate && r.birthDate <= filters.birthDateTo!
    );
  }
  if (filters.showOnlyWithSalary) {
    result = result.filter((r) => r.salarySource !== "none");
  }

  return result;
}

/**
 * Считает статистику по ЗП.
 *
 * ВАЖНО: записи без ЗП (salarySource === "none") считаются
 * в общем количестве (count), но НЕ участвуют в расчёте ЗП
 * (average, median, min, max, ranges).
 */
function getStats(filters: FilterState): SalaryStats {
  // Все записи с учётом фильтров (включая без ЗП)
  const allRecords = getFiltered({ ...filters, showOnlyWithSalary: false });
  // Записи только с указанной ЗП
  const withSalary = allRecords.filter((r) => r.salarySource !== "none");

  const count = allRecords.length;
  const countWithSalary = withSalary.length;
  const countWithoutSalary = count - countWithSalary;

  // Среднее/медиана/мин/макс считаем ТОЛЬКО по записям с ЗП
  const salaries = withSalary
    .map((r) => {
      if (r.salaryFrom !== null && r.salaryTo !== null) {
        return (r.salaryFrom + r.salaryTo) / 2;
      }
      return r.salaryFrom || r.salaryTo || 0;
    })
    .filter((s) => s > 0)
    .sort((a, b) => a - b);

  if (salaries.length === 0) {
    return {
      count,
      countWithSalary,
      countWithoutSalary,
      averageSalary: 0,
      medianSalary: 0,
      minSalary: 0,
      maxSalary: 0,
      salaryRanges: [],
    };
  }

  const sum = salaries.reduce((a, b) => a + b, 0);
  const avg = sum / salaries.length;
  const median =
    salaries.length % 2 === 0
      ? (salaries[salaries.length / 2 - 1] +
          salaries[salaries.length / 2]) /
        2
      : salaries[Math.floor(salaries.length / 2)];

  // Гистограмма: бакеты по 50к
  const bucketSize = 50_000;
  const min = salaries[0];
  const max = salaries[salaries.length - 1];
  const ranges: Array<{ range: string; count: number }> = [];

  for (
    let bucket = Math.floor(min / bucketSize) * bucketSize;
    bucket <= max;
    bucket += bucketSize
  ) {
    const from = bucket;
    const to = bucket + bucketSize;
    const label = `${formatK(from)}-${formatK(to)}`;
    const cnt = salaries.filter(
      (s) => s >= from && s < to
    ).length;
    ranges.push({ range: label, count: cnt });
  }

  return {
    count,
    countWithSalary,
    countWithoutSalary,
    averageSalary: Math.round(avg),
    medianSalary: Math.round(median),
    minSalary: salaries[0],
    maxSalary: salaries[salaries.length - 1],
    salaryRanges: ranges,
  };
}

function getDepartments(): string[] {
  const deps = new Set<string>();
  for (const r of getAll()) {
    if (r.department) deps.add(r.department);
  }
  return Array.from(deps).sort();
}

function getVacancies(): Array<{ id: string; name: string }> {
  const map = new Map<string, string>();
  for (const r of getAll()) {
    if (r.vacancyName) {
      map.set(r.vacancyName, r.vacancyName);
    }
  }
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}к`;
  return String(n);
}

// Экспортируем как объект (совместимость с существующим кодом)
export const dataStore = {
  getAll,
  getFiltered,
  getStats,
  getDepartments,
  getVacancies,
};
