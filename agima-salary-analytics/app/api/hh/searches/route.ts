import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

type SavedSearch = {
  id: number;
  name: string;
  query: string;
  role: string;
  role_mode: string;
  workshop: string;
  sub_workshop: string;
  location: string;
  area: string;
  grade: string;
  stack: string;
  pages: number;
  subscription_enabled: number;
  frequency: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
};

type HhResume = {
  id?: string;
  title?: string;
  age?: number;
  salary?: {
    amount?: number;
    from?: number;
    to?: number;
    currency?: string | { code?: string; abbr?: string };
  } | null;
  updated_at?: string;
  updated?: string;
  last_update?: string;
  created_at?: string;
  area?: { name?: string };
  total_experience?: { months?: number };
  employment_form?: Array<{ name?: string; id?: string }>;
  viewed?: boolean;
  favorited?: boolean;
  marked?: boolean;
};

type Observation = {
  resume_id: string;
  role: string;
  location: string;
  grade: string;
  stack: string;
  source_system: "hh_api";
  workshop: string;
  sub_workshop: string;
  salary_amount: number;
  salary_currency: string;
  age: number | null;
  age_bucket: string;
  resume_updated_at: string | null;
  found_at: string;
  candidate_title: string;
  total_experience_months: number | null;
  total_experience_years: number | null;
  employment_form: string;
  viewed: number;
  favorited: number;
  marked: number;
  source_query: string;
};

type Summary = {
  observations: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  average: number | null;
  p75: number | null;
  max: number | null;
};

type Snapshot = {
  id: number;
  created_at: string;
  period: string;
  trigger_type: string;
  role: string;
  location: string;
  grade: string;
  stack: string;
  workshop: string;
  sub_workshop: string;
  search_id: number | null;
  search_name: string | null;
  summary: Summary;
  observations: Observation[];
};

type Store = {
  searchSeq: number;
  snapshotSeq: number;
  searches: SavedSearch[];
  snapshots: Snapshot[];
};

const HH_API_BASE = "https://api.hh.ru";
const HH_USER_AGENT =
  process.env.HH_USER_AGENT || "agima-zp-analytics/1.0 (salary analytics)";

const globalStore = globalThis as typeof globalThis & {
  __hhSalaryStore?: Store;
};

const store: Store =
  globalStore.__hhSalaryStore ||
  {
    searchSeq: 0,
    snapshotSeq: 0,
    searches: [],
    snapshots: [],
  };

globalStore.__hhSalaryStore = store;

function cleanValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function nextRunDate(frequency?: string | null): string | null {
  if (!frequency) return null;

  const date = new Date();
  if (frequency === "week") date.setDate(date.getDate() + 7);
  else if (frequency === "month") date.setMonth(date.getMonth() + 1);
  else if (frequency === "quarter") date.setMonth(date.getMonth() + 3);
  else if (frequency === "half_year") date.setMonth(date.getMonth() + 6);
  else if (frequency === "year") date.setFullYear(date.getFullYear() + 1);
  else return null;

  return date.toISOString();
}

function ageBucket(age: number | null): string {
  if (age === null) return "unknown";
  if (age < 25) return "under_25";
  if (age <= 34) return "25_34";
  if (age <= 44) return "35_44";
  if (age <= 54) return "45_54";
  return "55_plus";
}

function inferGrade(title: string, fallback: string): string {
  if (fallback && fallback !== "all") return fallback;

  const text = title.toLowerCase();
  if (
    ["lead", "team lead", "руководитель", "ведущий"].some((item) =>
      text.includes(item)
    )
  ) {
    return "lead";
  }
  if (
    ["senior", "старший", "главный"].some((item) => text.includes(item))
  ) {
    return "senior";
  }
  if (["middle", "мидл"].some((item) => text.includes(item))) {
    return "middle";
  }
  if (
    ["junior", "джуниор", "младший", "стажер", "intern"].some((item) =>
      text.includes(item)
    )
  ) {
    return "junior";
  }
  return "unknown";
}

function extractSalary(item: HhResume): { amount: number | null; currency: string } {
  const salary = item.salary;
  if (!salary) return { amount: null, currency: "RUR" };

  const rawAmount = salary.amount ?? salary.from ?? salary.to ?? null;
  const amount =
    typeof rawAmount === "number" && Number.isFinite(rawAmount)
      ? rawAmount
      : null;
  const rawCurrency = salary.currency;
  const currency =
    typeof rawCurrency === "string"
      ? rawCurrency
      : rawCurrency?.code || rawCurrency?.abbr || "RUR";

  return { amount, currency };
}

function formatEmploymentForm(values: HhResume["employment_form"]): string {
  if (!Array.isArray(values)) return "";
  return values
    .map((item) => item.name || item.id || "")
    .filter(Boolean)
    .join(", ");
}

function percentile(values: number[], q: number): number | null {
  if (values.length === 0) return null;

  const ordered = [...values].sort((a, b) => a - b);
  const pos = (ordered.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.min(lower + 1, ordered.length - 1);
  const weight = pos - lower;
  return Math.round(ordered[lower] * (1 - weight) + ordered[upper] * weight);
}

function summarize(values: number[]): Summary {
  if (values.length === 0) {
    return {
      observations: 0,
      min: null,
      p25: null,
      median: null,
      average: null,
      p75: null,
      max: null,
    };
  }

  const ordered = [...values].sort((a, b) => a - b);
  return {
    observations: ordered.length,
    min: ordered[0],
    p25: percentile(ordered, 0.25),
    median: percentile(ordered, 0.5),
    average: Math.round(
      ordered.reduce((sum, value) => sum + value, 0) / ordered.length
    ),
    p75: percentile(ordered, 0.75),
    max: ordered[ordered.length - 1],
  };
}

function buildObservation(
  item: HhResume,
  search: SavedSearch,
  foundAt: string
): Observation | null {
  const resumeId = item.id;
  if (!resumeId) return null;

  const { amount, currency } = extractSalary(item);
  if (amount === null) return null;

  const age = typeof item.age === "number" ? item.age : null;
  const totalExperienceMonths =
    typeof item.total_experience?.months === "number"
      ? item.total_experience.months
      : null;

  return {
    resume_id: resumeId,
    role: search.role,
    location: search.location || item.area?.name || "unknown",
    grade: inferGrade(item.title || "", search.grade || "all"),
    stack: search.stack || "",
    source_system: "hh_api",
    workshop: search.workshop || "",
    sub_workshop: search.sub_workshop || "",
    salary_amount: amount,
    salary_currency: currency,
    age,
    age_bucket: ageBucket(age),
    resume_updated_at:
      item.updated_at || item.updated || item.last_update || item.created_at || null,
    found_at: foundAt,
    candidate_title: item.title || "",
    total_experience_months: totalExperienceMonths,
    total_experience_years:
      totalExperienceMonths === null
        ? null
        : Math.round((totalExperienceMonths / 12) * 10) / 10,
    employment_form: formatEmploymentForm(item.employment_form),
    viewed: item.viewed ? 1 : 0,
    favorited: item.favorited ? 1 : 0,
    marked: item.marked ? 1 : 0,
    source_query: search.query,
  };
}

async function requireUser(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

function getHhToken(): string {
  const token = process.env.HH_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Добавьте в Vercel переменную HH_ACCESS_TOKEN с OAuth-токеном HH"
    );
  }
  return token;
}

async function fetchHhResumes(search: SavedSearch): Promise<Observation[]> {
  const token = getHhToken();
  const observations: Observation[] = [];
  const foundAt = new Date().toISOString();

  for (let page = 0; page < Math.max(1, search.pages || 1); page += 1) {
    const url = new URL(`${HH_API_BASE}/resumes`);
    url.searchParams.set("text", search.query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "50");
    url.searchParams.set("order_by", "publication_time");
    if (search.area) url.searchParams.set("area", search.area);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "HH-User-Agent": HH_USER_AGENT,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`HH API вернул ${response.status}: ${details}`);
    }

    const data = (await response.json()) as {
      items?: HhResume[];
      pages?: number;
    };
    for (const item of data.items || []) {
      const observation = buildObservation(item, search, foundAt);
      if (observation) observations.push(observation);
    }

    if (page + 1 >= (data.pages || 0)) break;
  }

  return observations;
}

function saveSearchFromPayload(body: Record<string, unknown>): SavedSearch {
  const searchId = Number(body.searchId);
  const existing =
    Number.isInteger(searchId) && searchId > 0
      ? store.searches.find((item) => item.id === searchId)
      : null;
  const subscriptionEnabled = Boolean(body.subscriptionEnabled);
  const frequency = subscriptionEnabled
    ? cleanValue(body.frequency) || "month"
    : null;
  const search: SavedSearch = {
    id: existing?.id || ++store.searchSeq,
    name: cleanValue(body.name) || cleanValue(body.role) || cleanValue(body.query),
    query: cleanValue(body.query) || cleanValue(body.role),
    role: cleanValue(body.role) || cleanValue(body.query),
    role_mode: cleanValue(body.roleMode) || "existing",
    workshop: cleanValue(body.workshop),
    sub_workshop: cleanValue(body.subWorkshop),
    location: cleanValue(body.location) || "Москва",
    area: cleanValue(body.area) || "1",
    grade: cleanValue(body.grade) || "all",
    stack: cleanValue(body.stack),
    pages: positiveInt(body.pages, 1, 10),
    subscription_enabled: subscriptionEnabled ? 1 : 0,
    frequency,
    next_run_at: subscriptionEnabled
      ? existing?.next_run_at || nextRunDate(frequency)
      : null,
    last_run_at: existing?.last_run_at || null,
  };

  if (existing) {
    Object.assign(existing, search);
    return existing;
  }

  store.searches.unshift(search);
  return search;
}

async function runSavedSearch(
  search: SavedSearch,
  triggerType: "on_demand" | "subscription"
) {
  const observations = await fetchHhResumes(search);
  const snapshot: Snapshot = {
    id: ++store.snapshotSeq,
    created_at: new Date().toISOString(),
    period: currentPeriod(),
    trigger_type: triggerType,
    role: search.role,
    location: search.location,
    grade: search.grade,
    stack: search.stack,
    workshop: search.workshop,
    sub_workshop: search.sub_workshop,
    search_id: search.id,
    search_name: search.name,
    summary: summarize(observations.map((item) => item.salary_amount)),
    observations,
  };

  store.snapshots.unshift(snapshot);
  search.last_run_at = snapshot.created_at;
  search.next_run_at = search.subscription_enabled
    ? nextRunDate(search.frequency)
    : null;

  return {
    searchId: search.id,
    searchName: search.name,
    snapshotId: snapshot.id,
    summary: snapshot.summary,
  };
}

function matches(value: string | null | undefined, filter: string | null): boolean {
  return !filter || (value || "").toLowerCase() === filter.toLowerCase();
}

function filterSnapshots(params: URLSearchParams): Snapshot[] {
  const searchId = Number(params.get("searchId"));
  const searchIds = (params.get("searchIds") || "")
    .split(",")
    .map(Number)
    .filter(Number.isFinite);
  const snapshotIds = (params.get("snapshotIds") || "")
    .split(",")
    .map(Number)
    .filter(Number.isFinite);
  const fromDate = params.get("fromDate");
  const toDate = params.get("toDate");

  return store.snapshots.filter((snapshot) => {
    if (Number.isInteger(searchId) && searchId > 0 && snapshot.search_id !== searchId) {
      return false;
    }
    if (searchIds.length > 0 && !searchIds.includes(snapshot.search_id || 0)) {
      return false;
    }
    if (snapshotIds.length > 0 && !snapshotIds.includes(snapshot.id)) return false;
    if (!matches(snapshot.role, params.get("role"))) return false;
    if (!matches(snapshot.grade, params.get("grade"))) return false;
    if (!matches(snapshot.location, params.get("location"))) return false;
    if (!matches(snapshot.workshop, params.get("workshop"))) return false;
    if (!matches(snapshot.sub_workshop, params.get("subWorkshop"))) return false;
    if (fromDate && snapshot.created_at.slice(0, 10) < fromDate) return false;
    if (toDate && snapshot.created_at.slice(0, 10) > toDate) return false;
    return true;
  });
}

function groupValue(item: Observation, groupType: string): string {
  if (groupType === "grade") return item.grade || "unknown";
  if (groupType === "location") return item.location || "unknown";
  if (groupType === "age_bucket") return item.age_bucket || "unknown";
  if (groupType === "stack") return item.stack || "unknown";
  if (groupType === "workshop") return item.workshop || "unknown";
  if (groupType === "sub_workshop") return item.sub_workshop || "unknown";
  return item.role || "unknown";
}

function buildGroups(snapshots: Snapshot[], params: URLSearchParams) {
  const groupType = params.get("groupType") || "role";
  const birthDateFrom = params.get("birthDateFrom");
  const birthDateTo = params.get("birthDateTo");
  const nowYear = new Date().getFullYear();
  const groups = new Map<string, Observation[]>();

  for (const snapshot of snapshots) {
    for (const item of snapshot.observations) {
      if (birthDateFrom || birthDateTo) {
        if (item.age === null) continue;
        const birthYear = nowYear - item.age;
        if (birthDateFrom && String(birthYear) < birthDateFrom.slice(0, 4)) {
          continue;
        }
        if (birthDateTo && String(birthYear) > birthDateTo.slice(0, 4)) {
          continue;
        }
      }

      const key = groupValue(item, groupType);
      groups.set(key, [...(groups.get(key) || []), item]);
    }
  }

  return Array.from(groups.entries())
    .map(([value, items]) => {
      const summary = summarize(items.map((item) => item.salary_amount));
      return {
        group_type: groupType,
        group_value: value,
        observations_count: summary.observations,
        salary_min: summary.min,
        salary_p25: summary.p25,
        salary_median: summary.median,
        salary_avg: summary.average,
        salary_p75: summary.p75,
        salary_max: summary.max,
      };
    })
    .sort((a, b) => b.observations_count - a.observations_count);
}

function filterOptions() {
  const values = (selector: (snapshot: Snapshot) => string) =>
    Array.from(new Set(store.snapshots.map(selector).filter(Boolean))).sort();

  return {
    roles: values((snapshot) => snapshot.role),
    grades: values((snapshot) => snapshot.grade),
    workshops: values((snapshot) => snapshot.workshop),
    subWorkshops: values((snapshot) => snapshot.sub_workshop),
    cuts: store.snapshots.map((snapshot) => ({
      id: snapshot.id,
      created_at: snapshot.created_at,
      role: snapshot.role,
      grade: snapshot.grade,
      search_id: snapshot.search_id,
      search_name: snapshot.search_name,
    })),
  };
}

function snapshotListItem(snapshot: Snapshot) {
  return {
    id: snapshot.id,
    created_at: snapshot.created_at,
    period: snapshot.period,
    trigger_type: snapshot.trigger_type,
    role: snapshot.role,
    location: snapshot.location,
    grade: snapshot.grade,
    stack: snapshot.stack,
    workshop: snapshot.workshop,
    sub_workshop: snapshot.sub_workshop,
    search_id: snapshot.search_id,
    search_name: snapshot.search_name,
    summary: snapshot.summary,
  };
}

export async function GET(request: NextRequest) {
  const payload = await requireUser(request);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const snapshots = filterSnapshots(params);

  return NextResponse.json(
    {
      searches: store.searches,
      snapshots: snapshots.map(snapshotListItem),
      groups: buildGroups(snapshots, params),
      filterOptions: filterOptions(),
      persistence: "runtime-memory",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const payload = await requireUser(request);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = cleanValue(body.action) || "save";

  try {
    if (action === "deleteSnapshot") {
      const snapshotId = Number(body.snapshotId);
      if (!Number.isInteger(snapshotId) || snapshotId < 1) {
        return NextResponse.json(
          { error: "Не выбран снимок для удаления" },
          { status: 400 }
        );
      }

      const before = store.snapshots.length;
      store.snapshots = store.snapshots.filter(
        (snapshot) => snapshot.id !== snapshotId
      );
      return NextResponse.json(
        { ok: true, deleted: before - store.snapshots.length },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (action === "runDue") {
      const now = new Date().toISOString();
      const due = store.searches.filter(
        (search) =>
          search.subscription_enabled &&
          (!search.next_run_at || search.next_run_at <= now)
      );
      const results = [];
      for (const search of due) {
        results.push(await runSavedSearch(search, "subscription"));
      }
      return NextResponse.json(
        { ok: true, ran: results.length, results },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (action === "run") {
      const ids: number[] = Array.isArray(body.searchIds)
        ? body.searchIds.map(Number)
        : [Number(body.searchId)];
      const uniqueIds = Array.from(
        new Set(ids.filter((id) => Number.isInteger(id) && id > 0))
      );
      if (uniqueIds.length === 0) {
        return NextResponse.json(
          { error: "Выберите хотя бы один HH-поиск" },
          { status: 400 }
        );
      }

      const results = [];
      for (const id of uniqueIds) {
        const search = store.searches.find((item) => item.id === id);
        if (search) results.push(await runSavedSearch(search, "on_demand"));
      }
      return NextResponse.json(
        { ok: true, ran: results.length, results },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const query = cleanValue(body.query) || cleanValue(body.role);
    const role = cleanValue(body.role) || query;
    if (!query || !role) {
      return NextResponse.json(
        { error: "Выберите роль или укажите поисковый запрос" },
        { status: 400 }
      );
    }
    if (!cleanValue(body.workshop) || !cleanValue(body.subWorkshop)) {
      return NextResponse.json(
        { error: "HH-поиск должен быть привязан к цеху и подцеху" },
        { status: 400 }
      );
    }
    if (Boolean(body.subscriptionEnabled) && !cleanValue(body.frequency)) {
      return NextResponse.json(
        { error: "Выберите частоту подписки" },
        { status: 400 }
      );
    }

    const search = saveSearchFromPayload(body);
    if (action === "saveAndRun") {
      const result = await runSavedSearch(search, "on_demand");
      return NextResponse.json(
        { ok: true, search, result },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, search },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown HH searches action error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
