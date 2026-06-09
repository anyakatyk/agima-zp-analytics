import type {
  HuntflowVacancy,
  HuntflowApplicant,
  HuntflowComment,
  PaginatedResponse,
  SalaryRecord,
} from "./types";
import { huntflowToSalaryRecord } from "./salary-record-normalizer";

const BASE_URL = process.env.HUNTFLOW_API_BASE_URL || "https://api.huntflow.ru/v2";
const REQUEST_TIMEOUT_MS = 20_000;

export type HuntflowRawExportRow = {
  rowIndex: number;
  fullName: string;
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

export class HuntflowClient {
  private token: string;
  private accountId: number;

  constructor(token: string, accountId: number) {
    this.token = token;
    this.accountId = accountId;
  }

  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        signal: options?.signal || controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Huntflow API timeout after ${REQUEST_TIMEOUT_MS / 1000}s: ${path}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const details = await res.text();
      throw new Error(
        `Huntflow API error: ${res.status} ${res.statusText}${details ? `: ${details.slice(0, 500)}` : ""}`
      );
    }

    return res.json();
  }

  private buildPath(path: string, params?: Record<string, string | number | undefined>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== "") query.set(key, String(value));
    }
    const qs = query.toString();
    return qs ? `${path}?${qs}` : path;
  }

  async getVacancies(): Promise<HuntflowVacancy[]> {
    const vacancies: HuntflowVacancy[] = [];
    let page = 1;
    const perPage = 30;

    while (true) {
      const data = await this.request<PaginatedResponse<HuntflowVacancy>>(
        this.buildPath(`/accounts/${this.accountId}/vacancies`, {
          page,
          count: perPage,
        })
      );
      const items = data.items || [];
      vacancies.push(...items);
      if (items.length < perPage) break;
      page++;
    }

    return vacancies;
  }

  async getApplicants(
    page = 1,
    perPage = 100,
    vacancyId?: number
  ): Promise<PaginatedResponse<HuntflowApplicant>> {
    return this.request<PaginatedResponse<HuntflowApplicant>>(
      this.buildPath(`/accounts/${this.accountId}/applicants`, {
        page,
        count: perPage,
        vacancy_id: vacancyId,
      })
    );
  }

  async getApplicantComments(
    applicantId: number
  ): Promise<HuntflowComment[]> {
    try {
      const data = await this.request<{ items: HuntflowComment[] }>(
        `/accounts/${this.accountId}/applicants/${applicantId}/comments`
      );
      return data.items || [];
    } catch {
      return [];
    }
  }

  async getVacancyStatusNames(): Promise<Record<string, string>> {
    try {
      const data = await this.request<{ items?: Array<Record<string, unknown>> }>(
        `/accounts/${this.accountId}/vacancies/status_groups`
      );
      const names: Record<string, string> = {};
      for (const group of data.items || []) {
        const groupName = String(group.name || "");
        const statuses = Array.isArray(group.statuses) ? group.statuses : [];
        for (const status of statuses) {
          if (!status || typeof status !== "object") continue;
          const record = status as Record<string, unknown>;
          const id = record.account_vacancy_status || record.status || record.id;
          if (id && groupName) names[String(id)] = groupName;
        }
      }
      return names;
    } catch {
      return {};
    }
  }

  /**
   * Полная синхронизация: загружает вакансии и всех кандидатов одним проходом.
   */
  async syncAll(
    onProgress?: (current: number, total: number) => void
  ): Promise<SalaryRecord[]> {
    const allRecords: SalaryRecord[] = [];
    const perPage = 30;
    let totalFetched = 0;
    const vacancies = await this.getVacancies();
    const vacanciesById = new Map(vacancies.map((vacancy) => [vacancy.id, vacancy]));
    const statusNames = await this.getVacancyStatusNames();
    const exportDate = new Date().toISOString();
    let page = 1;

    while (true) {
      const response = await this.getApplicants(page, perPage);
      const applicants = response.items || [];

      if (applicants.length === 0) break;

      for (const applicant of applicants) {
        const linkedVacancyIds = this.getApplicantVacancyIds(applicant);
        const recordVacancyIds = linkedVacancyIds.length ? linkedVacancyIds : [undefined];

        for (const linkedVacancyId of recordVacancyIds) {
          const vacancy = linkedVacancyId ? vacanciesById.get(linkedVacancyId) : undefined;
          const record = await huntflowToSalaryRecord(
            applicant,
            [],
            {
              vacancy,
              vacancyId: linkedVacancyId,
              vacancyStatusNames: statusNames,
              exportDate,
            }
          );
          allRecords.push(record);
        }
      }

      totalFetched += applicants.length;
      onProgress?.(totalFetched, response.total || totalFetched);

      if (applicants.length < perPage) break;
      page++;
    }

    return allRecords;
  }

  async collectRawExportRowsForInternalLlm(options?: {
    vacancyIds?: number[];
  }): Promise<HuntflowRawExportRow[]> {
    const rows: HuntflowRawExportRow[] = [];
    const vacancies = await this.getVacancies();
    const vacanciesById = new Map(vacancies.map((vacancy) => [vacancy.id, vacancy]));
    const statusNames = await this.getVacancyStatusNames();
    const exportDate = new Date().toISOString();
    const vacancyIds = options?.vacancyIds?.filter((id) => Number.isFinite(id));
    const targets = vacancyIds?.length ? vacancyIds : [undefined];
    const perPage = 30;

    for (const targetVacancyId of targets) {
      let page = 1;

      while (true) {
        const response = await this.getApplicants(page, perPage, targetVacancyId);
        const applicants = response.items || [];
        if (applicants.length === 0) break;

        for (const applicant of applicants) {
          const linkedVacancyIds = this.getApplicantVacancyIds(applicant);
          const recordVacancyIds =
            targetVacancyId !== undefined
              ? [targetVacancyId]
              : linkedVacancyIds.length
                ? linkedVacancyIds
                : [undefined];

          for (const linkedVacancyId of recordVacancyIds) {
            const vacancy = linkedVacancyId ? vacanciesById.get(linkedVacancyId) : undefined;
            const record = await huntflowToSalaryRecord(
              applicant,
              [],
              {
                vacancy,
                vacancyId: linkedVacancyId,
                vacancyStatusNames: statusNames,
                exportDate,
              }
            );
            rows.push({
              rowIndex: rows.length,
              fullName: this.getApplicantFullName(applicant),
              lastWorkplace: record.lastWorkplace || this.stringify(applicant.company || applicant.experience),
              position: record.position || applicant.position || "",
              salary: this.formatSalary(record) || this.stringify(applicant.money || applicant.salary),
              birthDate: record.birthDate || applicant.birthday || applicant.birth_date || "",
              status: record.status || "",
              vacancyName:
                record.vacancyName ||
                vacancy?.position ||
                vacancy?.name ||
                vacancy?.title ||
                "",
              grade: record.grade || "",
              workshop: record.workshop || "",
              subWorkshop: record.subWorkshop || "",
              date: this.formatDate(record.createdAt || new Date().toISOString()),
            });
          }
        }

        if (applicants.length < perPage) break;
        page++;
      }
    }

    return rows;
  }

  private getApplicantVacancyIds(applicant: HuntflowApplicant): number[] {
    const values = [
      ...this.asRecordArray(applicant.links),
      ...this.asRecordArray(applicant.vacancies),
    ];
    const ids = new Set<number>();

    for (const value of values) {
      const id = this.extractId(value.vacancy ?? value.vacancy_id);
      if (id !== null) ids.add(id);
    }

    return Array.from(ids);
  }

  private asRecordArray(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object"
      );
    }
    if (value && typeof value === "object") {
      return [value as Record<string, unknown>];
    }
    return [];
  }

  private extractId(value: unknown): number | null {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (value && typeof value === "object") {
      return this.extractId((value as Record<string, unknown>).id);
    }
    return null;
  }

  private getApplicantFullName(applicant: HuntflowApplicant): string {
    const parts = [applicant.last_name, applicant.first_name, applicant.middle_name]
      .map((part) => part?.trim())
      .filter(Boolean);
    return parts.join(" ") || applicant.name || "";
  }

  private formatSalary(record: SalaryRecord): string {
    if (record.rawSalaryText) return record.rawSalaryText;
    if (record.salaryFrom && record.salaryTo && record.salaryFrom !== record.salaryTo) {
      return `${record.salaryFrom} - ${record.salaryTo} ${record.salaryCurrency}`;
    }
    const value = record.salaryFrom || record.salaryTo;
    return value ? `${value} ${record.salaryCurrency}` : "";
  }

  private formatDate(value?: string): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toISOString().slice(0, 10);
  }

  private stringify(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "object") {
      const item = value as Record<string, unknown>;
      return this.stringify(item.amount || item.money || item.value || item.name || item.title || item.id);
    }
    return String(value);
  }
}
