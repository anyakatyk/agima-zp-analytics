import type {
  User,
  SalaryRecord,
  MaskedSalaryRecord,
  SalaryStats,
  FilterState,
  AuditAction,
} from "../types";
import { canViewComments } from "./access-control";
import { maskRecords } from "./data-masking";
import { logAuditEvent } from "./audit-log";

/**
 * Единая прослойка доступа к данным.
 * Все запросы к данным проходят через этот слой.
 */
export class DataAccessLayer {
  constructor(
    private getRecords: () => SalaryRecord[],
    private getStatsFn: (filters: FilterState) => SalaryStats
  ) {}

  /**
   * Получить записи с учётом роли и фильтров
   */
  getRecordsForUser(
    user: User,
    filters: FilterState,
    options?: { page?: number; perPage?: number }
  ): { records: MaskedSalaryRecord[]; total: number } {
    // Логируем обращение
    logAuditEvent({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: this.filtersToAction(filters),
      details: `Фильтры: ${JSON.stringify(filters)}`,
    });

    let records = this.getRecords();

    // Для manager — фильтр только по своему отделу
    if (user.role === "manager" && user.department) {
      records = records.filter(
        (r) =>
          r.department.toLowerCase() === user.department!.toLowerCase()
      );
    }

    // Применяем фильтры
    records = this.applyFilters(records, filters);

    const total = records.length;

    // Пагинация
    const page = options?.page || 1;
    const perPage = options?.perPage || 50;
    const start = (page - 1) * perPage;
    const paginated = records.slice(start, start + perPage);

    // Маскируем данные
    const masked = maskRecords(paginated, user.role);

    return { records: masked, total };
  }

  /**
   * Получить статистику с учётом роли
   */
  getStatsForUser(user: User, filters: FilterState): SalaryStats {
    logAuditEvent({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "view_dashboard",
    });

    // Для manager — добавляем фильтр по отделу
    const effectiveFilters: FilterState = {
      ...filters,
      department:
        user.role === "manager" && user.department
          ? user.department
          : filters.department,
    };

    return this.getStatsFn(effectiveFilters);
  }

  /**
   * Экспорт данных (с проверкой прав)
   */
  exportData(
    user: User,
    filters: FilterState,
    format: "xlsx" | "pdf"
  ): SalaryRecord[] {
    const action: AuditAction =
      format === "xlsx" ? "export_excel" : "export_pdf";

    logAuditEvent({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action,
      details: `Экспорт ${format}, фильтры: ${JSON.stringify(filters)}`,
    });

    let records = this.getRecords();

    // Manager — только свой отдел
    if (user.role === "manager" && user.department) {
      records = records.filter(
        (r) =>
          r.department.toLowerCase() === user.department!.toLowerCase()
      );
    }

    return this.applyFilters(records, filters);
  }

  /**
   * Проверить, может ли пользователь видеть комментарии
   */
  canSeeComments(user: User): boolean {
    return canViewComments(user.role);
  }

  private applyFilters(
    records: SalaryRecord[],
    filters: FilterState
  ): SalaryRecord[] {
    let result = records;

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

  private filtersToAction(filters: FilterState): AuditAction {
    if (filters.vacancyId) return "view_vacancies";
    return "view_candidates";
  }
}
