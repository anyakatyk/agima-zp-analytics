// ---- User & Auth ----
export type UserRole = "admin" | "hr" | "manager";

export type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department?: string; // для manager — его отдел
};

// ---- Salary Records ----
export type SalarySource = "field" | "comment" | "none";

export type SalaryRecord = {
  id: string;
  huntflowId?: number;
  fullName?: string; // необязательный — если нет, показываем ID
  position: string;
  workshop: string;     // цех
  subWorkshop: string;  // подцех
  techStack: string;    // стек
  department: string;
  grade: string;        // грейд ( junior/middle/senior — определяется из данных)
  vacancyId?: string;
  vacancyName?: string;
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryCurrency: string;
  salarySource: SalarySource;
  rawSalaryText: string | null;
  commentExcerpt?: string;
  status: string;
  birthDate?: string; // дата рождения
  lastWorkplace?: string; // последнее место работы
  createdAt?: string; // дата добавления из выгрузки (не генерируется)
  updatedAt: string;
};

// Обезличенная запись для UI
export type MaskedSalaryRecord = Omit<SalaryRecord, "fullName"> & {
  displayName: string; // ФИО, замаскированное ФИО или ID — в зависимости от роли и наличия данных
};

// ---- Aggregated Stats ----
export type SalaryStats = {
  count: number;
  countWithSalary: number;
  countWithoutSalary: number;
  averageSalary: number;
  medianSalary: number;
  minSalary: number;
  maxSalary: number;
  salaryRanges: Array<{ range: string; count: number }>;
};

// ---- Filters ----
export type FilterState = {
  dateFrom: string | null;
  dateTo: string | null;
  vacancyId: string | null;
  department: string | null;
  workshop: string | null;
  subWorkshop: string | null;
  techStack: string | null;
  grade: string | null;
  birthDateFrom: string | null;
  birthDateTo: string | null;
  showOnlyWithSalary: boolean;
};

// ---- Data Source ----
export type DataSourceMode = "api" | "csv";

// ---- Audit Log ----
export type AuditAction =
  | "login"
  | "view_dashboard"
  | "view_candidates"
  | "view_vacancies"
  | "export_excel"
  | "export_pdf"
  | "upload_csv"
  | "sync_huntflow"
  | "change_settings";

export type AuditEntry = {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: AuditAction;
  details?: string;
  timestamp: string;
  ip?: string;
};

// ---- Huntflow API Types ----
export type HuntflowVacancy = {
  id: number;
  position?: string;
  name?: string;
  title?: string;
  department?: string;
  company?: string;
  account_division?: { id?: number; name?: string; title?: string } | string;
  division?: { id?: number; name?: string; title?: string } | string;
  status?: string;
  [key: string]: unknown;
};

export type HuntflowApplicant = {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  phone?: string;
  email?: string;
  position?: string;
  company?: string;
  money?: number | string;
  salary?: number | string | {
    amount?: number | string;
    money?: number | string;
    value?: number | string;
    currency?: string | { code?: string; name?: string };
    currency_code?: string;
  };
  salaryCurrency?: string;
  experience?: string;
  birthday?: string;
  birth_date?: string;
  status?: string | { id?: number; name?: string; title?: string };
  vacancy_status?: string | number | { id?: number; name?: string; title?: string };
  links?: Array<Record<string, unknown>>;
  vacancies?: Array<Record<string, unknown>>;
  created?: string;
  updated?: string;
  [key: string]: unknown;
};

export type HuntflowComment = {
  id: number;
  text: string;
  created: string;
  user?: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
};

// ---- Export ----
export type ExportFormat = "xlsx" | "pdf";
