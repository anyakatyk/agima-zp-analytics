/**
 * Трёхуровневая иерархия: Цех → Подцех → Стек
 * Хранится в памяти (MVP). В проде — в БД.
 */

export type DictionaryEntry = {
  id: string;
  name: string;
  aliases: string[];
  createdAt: string;
};

export type Workshop = DictionaryEntry & {
  parentId?: never; // цех — корневой уровень
};

export type SubWorkshop = DictionaryEntry & {
  workshopId: string; // привязка к цеху
};

export type TechStack = DictionaryEntry & {
  subWorkshopId: string; // привязка к подцеху
};

export type Role = DictionaryEntry & {
  workshopId: string;
  subWorkshopId: string;
  techStackId?: string;
  grade?: string;
};

type DictStore<T extends DictionaryEntry> = {
  entries: T[];
  counter: number;
};

// ---- Хранилища ----

const workshops: DictStore<Workshop> = {
  entries: [
    { id: "w1", name: "Производственный менеджмент", aliases: ["производственный менеджмент", "pm"], createdAt: new Date().toISOString() },
    { id: "w2", name: "Проектирование и дизайн", aliases: ["проектирование", "дизайн", "design"], createdAt: new Date().toISOString() },
    { id: "w3", name: "Разработка", aliases: ["разработка", "dev", "development"], createdAt: new Date().toISOString() },
    { id: "w4", name: "HR", aliases: ["hr", "кадры"], createdAt: new Date().toISOString() },
    { id: "w5", name: "Финансово-юридический", aliases: ["финансовый", "юридический", "финансово-юридический"], createdAt: new Date().toISOString() },
    { id: "w6", name: "Продуктовая аналитика", aliases: ["продуктовая аналитика", "аналитика"], createdAt: new Date().toISOString() },
    { id: "w7", name: "Офис", aliases: ["офис"], createdAt: new Date().toISOString() },
    { id: "w8", name: "Маркетинг", aliases: ["маркетинг", "marketing"], createdAt: new Date().toISOString() },
  ],
  counter: 8,
};

const subWorkshops: DictStore<SubWorkshop> = {
  entries: [
    // Производственный менеджмент
    { id: "s1", name: "Руководители проектов", workshopId: "w1", aliases: ["руководители проектов", "руководитель проекта"], createdAt: new Date().toISOString() },
    // Проектирование и дизайн
    { id: "s2", name: "Дизайн", workshopId: "w2", aliases: ["дизайн", "design"], createdAt: new Date().toISOString() },
    { id: "s3", name: "Проектирование интерфейсов", workshopId: "w2", aliases: ["проектирование интерфейсов", "ux", "ui"], createdAt: new Date().toISOString() },
    { id: "s4", name: "Системная аналитика", workshopId: "w2", aliases: ["системная аналитика", "системный аналитик"], createdAt: new Date().toISOString() },
    { id: "s5", name: "SEO", workshopId: "w2", aliases: ["seo"], createdAt: new Date().toISOString() },
    // Разработка
    { id: "s6", name: "Backend", workshopId: "w3", aliases: ["backend", "back-end", "бэкенд"], createdAt: new Date().toISOString() },
    { id: "s7", name: "Frontend", workshopId: "w3", aliases: ["frontend", "front-end", "фронтенд"], createdAt: new Date().toISOString() },
    { id: "s8", name: "Мобильная разработка", workshopId: "w3", aliases: ["мобильная разработка", "mobile", "ios", "android"], createdAt: new Date().toISOString() },
    { id: "s9", name: "Тестирование", workshopId: "w3", aliases: ["тестирование", "qa", "testing"], createdAt: new Date().toISOString() },
    { id: "s10", name: "DevOps", workshopId: "w3", aliases: ["devops", "dev ops"], createdAt: new Date().toISOString() },
    // Финансово-юридический
    { id: "s11", name: "Администраторы проектов", workshopId: "w5", aliases: ["администраторы проектов", "администратор проекта"], createdAt: new Date().toISOString() },
    { id: "s12", name: "Бухгалтерия", workshopId: "w5", aliases: ["бухгалтерия", "бухгалтер"], createdAt: new Date().toISOString() },
  ],
  counter: 12,
};

const techStacks: DictStore<TechStack> = {
  entries: [
    // Backend
    { id: "t1", name: "PHP", subWorkshopId: "s6", aliases: ["php"], createdAt: new Date().toISOString() },
    { id: "t2", name: "1C-Bitrix", subWorkshopId: "s6", aliases: ["1c-bitrix", "1с-битрикс", "битрикс"], createdAt: new Date().toISOString() },
    // Frontend
    { id: "t3", name: "React", subWorkshopId: "s7", aliases: ["react"], createdAt: new Date().toISOString() },
    { id: "t4", name: "Vue", subWorkshopId: "s7", aliases: ["vue", "vuejs"], createdAt: new Date().toISOString() },
  ],
  counter: 4,
};

const roles: DictStore<Role> = {
  entries: [
    {
      id: "r1",
      name: "Системный аналитик",
      workshopId: "w2",
      subWorkshopId: "s4",
      aliases: ["системный аналитик", "system analyst"],
      createdAt: new Date().toISOString(),
    },
    {
      id: "r2",
      name: "Frontend-разработчик",
      workshopId: "w3",
      subWorkshopId: "s7",
      techStackId: "t3",
      aliases: ["frontend", "фронтенд"],
      createdAt: new Date().toISOString(),
    },
    {
      id: "r3",
      name: "Backend-разработчик",
      workshopId: "w3",
      subWorkshopId: "s6",
      techStackId: "t1",
      aliases: ["backend", "бэкенд"],
      createdAt: new Date().toISOString(),
    },
  ],
  counter: 3,
};

// ---- Workshops (Цеха) ----

export function getWorkshops(): Workshop[] {
  return [...workshops.entries];
}

export function getWorkshopById(id: string): Workshop | undefined {
  return workshops.entries.find((w) => w.id === id);
}

export function addWorkshop(name: string, aliases: string[] = []): Workshop {
  const entry: Workshop = {
    id: `w${++workshops.counter}`,
    name: name.trim(),
    aliases: aliases.map((a) => a.toLowerCase().trim()),
    createdAt: new Date().toISOString(),
  };
  workshops.entries.push(entry);
  return entry;
}

export function updateWorkshop(id: string, name: string, aliases?: string[]): Workshop | null {
  const entry = workshops.entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.name = name.trim();
  if (aliases) entry.aliases = aliases.map((a) => a.toLowerCase().trim());
  return entry;
}

export function deleteWorkshop(id: string): boolean {
  const idx = workshops.entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  workshops.entries.splice(idx, 1);
  // Удаляем все подцехи этого цеха
  const subIds = subWorkshops.entries.filter((s) => s.workshopId === id).map((s) => s.id);
  for (const subId of subIds) {
    deleteSubWorkshop(subId);
  }
  roles.entries = roles.entries.filter((r) => r.workshopId !== id);
  return true;
}

// ---- SubWorkshops (Подцеха) ----

export function getSubWorkshops(workshopId?: string): SubWorkshop[] {
  if (workshopId) {
    return subWorkshops.entries.filter((s) => s.workshopId === workshopId);
  }
  return [...subWorkshops.entries];
}

export function getSubWorkshopById(id: string): SubWorkshop | undefined {
  return subWorkshops.entries.find((s) => s.id === id);
}

export function addSubWorkshop(workshopId: string, name: string, aliases: string[] = []): SubWorkshop {
  const entry: SubWorkshop = {
    id: `s${++subWorkshops.counter}`,
    workshopId,
    name: name.trim(),
    aliases: aliases.map((a) => a.toLowerCase().trim()),
    createdAt: new Date().toISOString(),
  };
  subWorkshops.entries.push(entry);
  return entry;
}

export function updateSubWorkshop(id: string, name: string, aliases?: string[]): SubWorkshop | null {
  const entry = subWorkshops.entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.name = name.trim();
  if (aliases) entry.aliases = aliases.map((a) => a.toLowerCase().trim());
  return entry;
}

export function deleteSubWorkshop(id: string): boolean {
  const idx = subWorkshops.entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  subWorkshops.entries.splice(idx, 1);
  // Удаляем все стеки этого подцеха
  techStacks.entries = techStacks.entries.filter((t) => t.subWorkshopId !== id);
  roles.entries = roles.entries.filter((r) => r.subWorkshopId !== id);
  return true;
}

// ---- TechStacks (Стеки) ----

export function getTechStacks(subWorkshopId?: string): TechStack[] {
  if (subWorkshopId) {
    return techStacks.entries.filter((t) => t.subWorkshopId === subWorkshopId);
  }
  return [...techStacks.entries];
}

export function getTechStackById(id: string): TechStack | undefined {
  return techStacks.entries.find((t) => t.id === id);
}

export function addTechStack(subWorkshopId: string, name: string, aliases: string[] = []): TechStack {
  const entry: TechStack = {
    id: `t${++techStacks.counter}`,
    subWorkshopId,
    name: name.trim(),
    aliases: aliases.map((a) => a.toLowerCase().trim()),
    createdAt: new Date().toISOString(),
  };
  techStacks.entries.push(entry);
  return entry;
}

export function updateTechStack(id: string, name: string, aliases?: string[]): TechStack | null {
  const entry = techStacks.entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.name = name.trim();
  if (aliases) entry.aliases = aliases.map((a) => a.toLowerCase().trim());
  return entry;
}

export function deleteTechStack(id: string): boolean {
  const idx = techStacks.entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  techStacks.entries.splice(idx, 1);
  for (const role of roles.entries) {
    if (role.techStackId === id) role.techStackId = undefined;
  }
  return true;
}

// ---- Roles (Роли) ----

export function getRoles(): Role[] {
  return [...roles.entries];
}

export function addRole(params: {
  name: string;
  workshopId: string;
  subWorkshopId: string;
  techStackId?: string;
  grade?: string;
  aliases?: string[];
}): Role {
  const entry: Role = {
    id: `r${++roles.counter}`,
    name: params.name.trim(),
    workshopId: params.workshopId,
    subWorkshopId: params.subWorkshopId,
    techStackId: params.techStackId || undefined,
    grade: params.grade?.trim() || undefined,
    aliases: (params.aliases || []).map((a) => a.toLowerCase().trim()),
    createdAt: new Date().toISOString(),
  };
  roles.entries.push(entry);
  return entry;
}

export function updateRole(
  id: string,
  params: {
    name: string;
    workshopId: string;
    subWorkshopId: string;
    techStackId?: string;
    grade?: string;
    aliases?: string[];
  }
): Role | null {
  const entry = roles.entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.name = params.name.trim();
  entry.workshopId = params.workshopId;
  entry.subWorkshopId = params.subWorkshopId;
  entry.techStackId = params.techStackId || undefined;
  entry.grade = params.grade?.trim() || undefined;
  if (params.aliases) {
    entry.aliases = params.aliases.map((a) => a.toLowerCase().trim());
  }
  return entry;
}

export function deleteRole(id: string): boolean {
  const idx = roles.entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  roles.entries.splice(idx, 1);
  return true;
}

// ---- Поиск для автозаполнения ----

function matchEntry(text: string, entries: DictionaryEntry[]): DictionaryEntry | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  for (const entry of entries) {
    if (entry.name.toLowerCase() === lower) return entry;
  }
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      if (lower.includes(alias) || alias.includes(lower)) return entry;
    }
  }
  return null;
}

export function matchWorkshop(text: string): Workshop | null {
  return matchEntry(text, workshops.entries) as Workshop | null;
}

export function matchSubWorkshop(text: string, workshopId?: string): SubWorkshop | null {
  const candidates = workshopId
    ? subWorkshops.entries.filter((s) => s.workshopId === workshopId)
    : subWorkshops.entries;
  return matchEntry(text, candidates) as SubWorkshop | null;
}

export function matchTechStack(text: string, subWorkshopId?: string): TechStack | null {
  const candidates = subWorkshopId
    ? techStacks.entries.filter((t) => t.subWorkshopId === subWorkshopId)
    : techStacks.entries;
  return matchEntry(text, candidates) as TechStack | null;
}

export function matchRole(text: string): Role | null {
  return matchEntry(text, roles.entries) as Role | null;
}

// ---- Получение полной иерархии ----

export function getFullHierarchy(): Array<{
  workshop: Workshop;
  subWorkshops: Array<{
    subWorkshop: SubWorkshop;
    stacks: TechStack[];
  }>;
}> {
  return workshops.entries.map((w) => ({
    workshop: w,
    subWorkshops: subWorkshops.entries
      .filter((s) => s.workshopId === w.id)
      .map((s) => ({
        subWorkshop: s,
        stacks: techStacks.entries.filter((t) => t.subWorkshopId === s.id),
      })),
  }));
}

export function getRoleOptions(): Array<{
  role: Role;
  workshop?: Workshop;
  subWorkshop?: SubWorkshop;
  techStack?: TechStack;
}> {
  return roles.entries.map((role) => ({
    role,
    workshop: workshops.entries.find((w) => w.id === role.workshopId),
    subWorkshop: subWorkshops.entries.find((s) => s.id === role.subWorkshopId),
    techStack: role.techStackId
      ? techStacks.entries.find((t) => t.id === role.techStackId)
      : undefined,
  }));
}
