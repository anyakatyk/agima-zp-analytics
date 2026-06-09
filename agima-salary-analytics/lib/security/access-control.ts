import type { UserRole } from "../types";

type Permission =
  | "view:all_candidates"
  | "view:department_candidates"
  | "view:salary_details"
  | "view:comments"
  | "view:masked_data_only"
  | "export:full"
  | "export:masked"
  | "upload:data"
  | "sync:huntflow"
  | "manage:users"
  | "manage:settings"
  | "view:audit_log";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    "view:all_candidates",
    "view:salary_details",
    "view:comments",
    "export:full",
    "upload:data",
    "sync:huntflow",
    "manage:users",
    "manage:settings",
    "view:audit_log",
  ],
  hr: [
    "view:all_candidates",
    "view:salary_details",
    "view:comments",
    "export:full",
    "upload:data",
  ],
  manager: [
    "view:department_candidates",
    "view:salary_details",
    "export:masked",
  ],
};

export function hasPermission(
  role: UserRole,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canViewFullData(role: UserRole): boolean {
  return hasPermission(role, "view:all_candidates");
}

export function canViewComments(role: UserRole): boolean {
  return hasPermission(role, "view:comments");
}

export function canExportFull(role: UserRole): boolean {
  return hasPermission(role, "export:full");
}

export function canManageSettings(role: UserRole): boolean {
  return hasPermission(role, "manage:settings");
}

export function canSyncHuntflow(role: UserRole): boolean {
  return hasPermission(role, "sync:huntflow");
}

export function canUploadData(role: UserRole): boolean {
  return hasPermission(role, "upload:data");
}

export function canViewAuditLog(role: UserRole): boolean {
  return hasPermission(role, "view:audit_log");
}
