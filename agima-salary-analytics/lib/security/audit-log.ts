import type { AuditEntry, AuditAction, UserRole } from "../types";

// In-memory аудит-журнал (MVP)
// В проде — в БД с шифрованием
const auditLog: AuditEntry[] = [];

let counter = 0;

export function logAuditEvent(params: {
  userId: string;
  userName: string;
  userRole: UserRole;
  action: AuditAction;
  details?: string;
  ip?: string;
}): AuditEntry {
  const entry: AuditEntry = {
    id: `audit-${++counter}-${Date.now()}`,
    userId: params.userId,
    userName: params.userName,
    userRole: params.userRole,
    action: params.action,
    details: params.details,
    timestamp: new Date().toISOString(),
    ip: params.ip,
  };

  auditLog.push(entry);

  // Лимит журнала — последние 10000 записей
  if (auditLog.length > 10000) {
    auditLog.splice(0, auditLog.length - 10000);
  }

  return entry;
}

export function getAuditLog(params?: {
  userId?: string;
  action?: AuditAction;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): { entries: AuditEntry[]; total: number } {
  let filtered = [...auditLog];

  if (params?.userId) {
    filtered = filtered.filter((e) => e.userId === params.userId);
  }
  if (params?.action) {
    filtered = filtered.filter((e) => e.action === params.action);
  }
  if (params?.dateFrom) {
    filtered = filtered.filter((e) => e.timestamp >= params.dateFrom!);
  }
  if (params?.dateTo) {
    filtered = filtered.filter((e) => e.timestamp <= params.dateTo!);
  }

  // Сортировка: новые первые
  filtered.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const total = filtered.length;
  const offset = params?.offset || 0;
  const limit = params?.limit || 50;
  const entries = filtered.slice(offset, offset + limit);

  return { entries, total };
}
