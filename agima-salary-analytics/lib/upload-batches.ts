import type { SalaryRecord } from "./types";

export type UploadBatch = {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  recordCount: number;
  recordsWithSalary: number;
  columnMapping: Record<string, string>;
  workshopOverride?: string;
  subWorkshopOverride?: string;
  techStackOverride?: string;
  departmentOverride?: string;
  gradeOverride?: string;
};

type BatchWithRecords = UploadBatch & {
  records: SalaryRecord[];
};

// In-memory хранилище
const batches: BatchWithRecords[] = [];
let counter = 0;

export function createBatch(params: {
  fileName: string;
  uploadedBy: string;
  records: SalaryRecord[];
  columnMapping: Record<string, string>;
  workshopOverride?: string;
  subWorkshopOverride?: string;
  techStackOverride?: string;
  departmentOverride?: string;
  gradeOverride?: string;
}): UploadBatch {
  const recordsWithSalary = params.records.filter(
    (r) => r.salarySource !== "none"
  ).length;

  const batch: BatchWithRecords = {
    id: `batch-${++counter}-${Date.now()}`,
    fileName: params.fileName,
    uploadedAt: new Date().toISOString(),
    uploadedBy: params.uploadedBy,
    recordCount: params.records.length,
    recordsWithSalary,
    columnMapping: params.columnMapping,
    workshopOverride: params.workshopOverride,
    subWorkshopOverride: params.subWorkshopOverride,
    techStackOverride: params.techStackOverride,
    departmentOverride: params.departmentOverride,
    gradeOverride: params.gradeOverride,
    records: params.records,
  };

  batches.push(batch);
  return { ...batch };
}

export function getAllBatches(): UploadBatch[] {
  return batches.map((batch) => ({
    id: batch.id,
    fileName: batch.fileName,
    uploadedAt: batch.uploadedAt,
    uploadedBy: batch.uploadedBy,
    recordCount: batch.recordCount,
    recordsWithSalary: batch.recordsWithSalary,
    columnMapping: batch.columnMapping,
    workshopOverride: batch.workshopOverride,
    subWorkshopOverride: batch.subWorkshopOverride,
    techStackOverride: batch.techStackOverride,
    departmentOverride: batch.departmentOverride,
    gradeOverride: batch.gradeOverride,
  }));
}

export function getBatch(batchId: string): BatchWithRecords | undefined {
  return batches.find((b) => b.id === batchId);
}

export function deleteBatch(batchId: string): boolean {
  const idx = batches.findIndex((b) => b.id === batchId);
  if (idx === -1) return false;
  batches.splice(idx, 1);
  return true;
}

/**
 * Собрать все записи из всех загрузок
 */
export function getAllRecords(): SalaryRecord[] {
  return batches.flatMap((b) => b.records);
}

/**
 * Получить все уникальные отделы из загрузок
 */
export function getDepartmentsFromBatches(): string[] {
  const deps = new Set<string>();
  for (const b of batches) {
    for (const r of b.records) {
      if (r.department) deps.add(r.department);
    }
  }
  return Array.from(deps).sort();
}

/**
 * Получить все уникальные вакансии из загрузок
 */
export function getVacanciesFromBatches(): Array<{ id: string; name: string }> {
  const map = new Map<string, string>();
  for (const b of batches) {
    for (const r of b.records) {
      if (r.vacancyName) {
        map.set(r.vacancyName, r.vacancyName);
      }
    }
  }
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
}
