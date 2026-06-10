import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = path.resolve(process.cwd(), "..");
const TOKEN_PATH = path.join(WORKSPACE_ROOT, "secrets", "hh_token");
const DEFAULT_PYTHON_BIN =
  "/Users/ashabaeva/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const PYTHON_BIN = process.env.PYTHON_BIN || DEFAULT_PYTHON_BIN;

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
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

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

function parseJson<T>(output: string): T {
  return JSON.parse(output.trim() || "{}") as T;
}

async function requireUser(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

async function runPython(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<CommandResult> {
  const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
    cwd: WORKSPACE_ROOT,
    env,
    timeout: 240_000,
    maxBuffer: 1024 * 1024 * 8,
  });
  return { stdout, stderr };
}

function parseSnapshotId(output: string): number | null {
  const line = output.split("\n").find((item) => item.startsWith("snapshot_id="));
  if (!line) return null;
  const value = Number(line.split("=")[1]);
  return Number.isFinite(value) ? value : null;
}

async function saveSearchFromPayload(body: Record<string, unknown>) {
  const subscriptionEnabled = Boolean(body.subscriptionEnabled);
  const args = [
    "hh_searches.py",
    "save",
    "--query",
    cleanValue(body.query) || cleanValue(body.role),
    "--role",
    cleanValue(body.role) || cleanValue(body.query),
    "--role-mode",
    cleanValue(body.roleMode) || "existing",
    "--location",
    cleanValue(body.location) || "Москва",
    "--area",
    cleanValue(body.area) || "1",
    "--grade",
    cleanValue(body.grade) || "all",
    "--pages",
    String(positiveInt(body.pages, 1, 10)),
  ];

  const searchId = Number(body.searchId);
  if (Number.isInteger(searchId) && searchId > 0) args.push("--search-id", String(searchId));
  if (cleanValue(body.name)) args.push("--name", cleanValue(body.name));
  if (cleanValue(body.workshop)) args.push("--workshop", cleanValue(body.workshop));
  if (cleanValue(body.subWorkshop)) args.push("--sub-workshop", cleanValue(body.subWorkshop));
  if (cleanValue(body.stack)) args.push("--stack", cleanValue(body.stack));
  if (subscriptionEnabled) {
    args.push("--subscription-enabled");
    if (cleanValue(body.frequency)) args.push("--frequency", cleanValue(body.frequency));
  }

  const result = await runPython(args);
  return parseJson<{ ok: boolean; search: SavedSearch }>(result.stdout).search;
}

async function getSearch(searchId: number): Promise<SavedSearch | null> {
  const result = await runPython(["hh_searches.py", "list", "--search-id", String(searchId), "--limit", "1"]);
  const data = parseJson<{ searches: SavedSearch[] }>(result.stdout);
  return data.searches?.[0] || null;
}

async function runSavedSearch(search: SavedSearch, triggerType: "on_demand" | "subscription") {
  if (!existsSync(TOKEN_PATH)) {
    throw new Error("HH token file not found: secrets/hh_token");
  }
  const hhAccessToken = readFileSync(TOKEN_PATH, "utf-8").trim();
  if (!hhAccessToken) {
    throw new Error("HH token file is empty: secrets/hh_token");
  }

  const env = { ...process.env, HH_ACCESS_TOKEN: hhAccessToken };
  const collect = await runPython(
    [
      "hh_salary_collector.py",
      "--text",
      search.query,
      "--area",
      search.area,
      "--pages",
      String(search.pages || 1),
    ],
    env
  );

  const snapshot = await runPython(
    [
      "salary_metrics.py",
      "snapshot",
      "--search-id",
      String(search.id),
      "--trigger-type",
      triggerType,
      "--period",
      currentPeriod(),
      "--query",
      search.query,
      "--role",
      search.role,
      "--location",
      search.location,
      "--grade",
      search.grade || "all",
      "--stack",
      search.stack || "",
      "--workshop",
      search.workshop || "",
      "--sub-workshop",
      search.sub_workshop || "",
      "--notes",
      `Создано из сохраненного HH-поиска #${search.id}`,
    ],
    env
  );

  const snapshotId = parseSnapshotId(snapshot.stdout);
  await runPython(["hh_searches.py", "mark-run", "--search-id", String(search.id)]);

  return {
    searchId: search.id,
    searchName: search.name,
    snapshotId,
    collect: collect.stdout,
    snapshot: snapshot.stdout,
  };
}

export async function GET(request: NextRequest) {
  const payload = await requireUser(request);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!existsSync(PYTHON_BIN)) {
    return NextResponse.json({ error: `Python для HH-отчетов не найден: ${PYTHON_BIN}` }, { status: 500 });
  }

  const params = request.nextUrl.searchParams;
  const args = ["hh_searches.py", "list", "--limit", params.get("limit") || "100"];
  for (const [key, cli] of [
    ["searchId", "--search-id"],
    ["searchIds", "--search-ids"],
    ["snapshotIds", "--snapshot-ids"],
    ["role", "--role"],
    ["grade", "--grade"],
    ["location", "--location"],
    ["workshop", "--workshop"],
    ["subWorkshop", "--sub-workshop"],
    ["fromDate", "--from-date"],
    ["toDate", "--to-date"],
  ] as const) {
    const value = params.get(key);
    if (value) args.push(cli, value);
  }

  const groupsArgs = ["hh_searches.py", "groups"];
  const searchIds = params.get("searchIds");
  const snapshotIds = params.get("snapshotIds");
  const groupType = params.get("groupType");
  if (searchIds) groupsArgs.push("--search-ids", searchIds);
  if (snapshotIds) groupsArgs.push("--snapshot-ids", snapshotIds);
  if (groupType) groupsArgs.push("--group-type", groupType);
  for (const [key, cli] of [
    ["role", "--role"],
    ["grade", "--grade"],
    ["location", "--location"],
    ["workshop", "--workshop"],
    ["subWorkshop", "--sub-workshop"],
    ["fromDate", "--from-date"],
    ["toDate", "--to-date"],
    ["birthDateFrom", "--birth-date-from"],
    ["birthDateTo", "--birth-date-to"],
  ] as const) {
    const value = params.get(key);
    if (value) groupsArgs.push(cli, value);
  }

  try {
    const [history, groups] = await Promise.all([runPython(args), runPython(groupsArgs)]);
    const historyData = parseJson<Record<string, unknown>>(history.stdout);
    const groupsData = parseJson<Record<string, unknown>>(groups.stdout);
    return NextResponse.json(
      {
        ...historyData,
        ...groupsData,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown HH searches error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const payload = await requireUser(request);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!existsSync(PYTHON_BIN)) {
    return NextResponse.json({ error: `Python для HH-отчетов не найден: ${PYTHON_BIN}` }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const action = cleanValue(body.action) || "save";

  try {
    if (action === "deleteSnapshot") {
      const snapshotId = Number(body.snapshotId);
      if (!Number.isInteger(snapshotId) || snapshotId < 1) {
        return NextResponse.json({ error: "Не выбран снимок для удаления" }, { status: 400 });
      }
      const deleted = await runPython(["hh_searches.py", "delete-snapshot", "--snapshot-id", String(snapshotId)]);
      return NextResponse.json(parseJson(deleted.stdout), { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "runDue") {
      const due = await runPython(["hh_searches.py", "due", "--limit", String(positiveInt(body.limit, 10, 30))]);
      const dueData = parseJson<{ searches: SavedSearch[] }>(due.stdout);
      const results = [];
      for (const search of dueData.searches || []) {
        results.push(await runSavedSearch(search, "subscription"));
      }
      return NextResponse.json({ ok: true, ran: results.length, results }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "run") {
      const searchIds: number[] = Array.isArray(body.searchIds)
        ? body.searchIds.map((item: unknown) => Number(item))
        : [Number(body.searchId)];
      const uniqueIds = Array.from(new Set(searchIds.filter((id: number) => Number.isInteger(id) && id > 0)));
      if (uniqueIds.length === 0) {
        return NextResponse.json({ error: "Выберите хотя бы один HH-поиск" }, { status: 400 });
      }
      const results = [];
      for (const id of uniqueIds) {
        const search = await getSearch(id);
        if (search) results.push(await runSavedSearch(search, "on_demand"));
      }
      return NextResponse.json({ ok: true, ran: results.length, results }, { headers: { "Cache-Control": "no-store" } });
    }

    const query = cleanValue(body.query) || cleanValue(body.role);
    const role = cleanValue(body.role) || query;
    if (!query || !role) {
      return NextResponse.json({ error: "Выберите роль или укажите поисковый запрос" }, { status: 400 });
    }
    if (!cleanValue(body.workshop) || !cleanValue(body.subWorkshop)) {
      return NextResponse.json({ error: "HH-поиск должен быть привязан к цеху и подцеху" }, { status: 400 });
    }
    if (Boolean(body.subscriptionEnabled) && !cleanValue(body.frequency)) {
      return NextResponse.json({ error: "Выберите частоту подписки" }, { status: 400 });
    }

    const search = await saveSearchFromPayload(body);
    if (action === "saveAndRun") {
      const result = await runSavedSearch(search, "on_demand");
      return NextResponse.json({ ok: true, search, result }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ ok: true, search }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown HH searches action error";
    const stdout = typeof error === "object" && error && "stdout" in error ? String(error.stdout) : "";
    const stderr = typeof error === "object" && error && "stderr" in error ? String(error.stderr) : "";
    return NextResponse.json({ error: message, stdout, stderr }, { status: 500 });
  }
}
