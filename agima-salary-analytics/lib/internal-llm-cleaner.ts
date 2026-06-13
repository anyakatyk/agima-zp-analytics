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

