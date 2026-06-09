import type { SalaryRecord, MaskedSalaryRecord, UserRole } from "../types";

/**
 * Маскирует ФИО: "Иванов Иван Иванович" → "Иванов И.И."
 * "Иванов Иван" → "Иванов И."
 */
export function maskFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) {
    return `${parts[0]} ${parts[1].charAt(0)}.`;
  }
  // Фамилия И.О.
  return `${parts[0]} ${parts[1].charAt(0)}.${parts[2].charAt(0)}.`;
}

/**
 * Генерирует displayName на основе наличия ФИО, роли и ID
 */
function getDisplayName(
  fullName: string | undefined,
  id: string,
  role: UserRole
): string {
  const needMask = role === "manager";

  // Если ФИО нет — показываем ID
  if (!fullName) {
    return `Кандидат #${id}`;
  }

  // Если маскирование включено
  if (needMask) {
    return maskFullName(fullName);
  }

  return fullName;
}

/**
 * Применяет маскировку к записи в зависимости от роли
 */
export function maskRecord(
  record: SalaryRecord,
  role: UserRole
): MaskedSalaryRecord {
  const needMask = role === "manager";

  // Создаём запись без fullName, добавляем displayName
  const { fullName, ...rest } = record;
  const masked: MaskedSalaryRecord = {
    ...rest,
    displayName: getDisplayName(fullName, record.id, role),
  };

  // Manager не видит комментарии
  if (needMask) {
    delete masked.commentExcerpt;
  }

  return masked;
}

/**
 * Маскирует массив записей
 */
export function maskRecords(
  records: SalaryRecord[],
  role: UserRole
): MaskedSalaryRecord[] {
  return records.map((r) => maskRecord(r, role));
}
