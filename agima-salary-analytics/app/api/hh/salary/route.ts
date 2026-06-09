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

type CommandResult = {
  command: string;
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

async function runPython(
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<CommandResult> {
  const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
    cwd: WORKSPACE_ROOT,
    env,
    timeout: 180_000,
    maxBuffer: 1024 * 1024 * 5,
  });

  return {
    command: `${PYTHON_BIN} ${args.join(" ")}`,
    stdout,
    stderr,
  };
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (!existsSync(TOKEN_PATH)) {
    return NextResponse.json(
      { error: "HH token file not found: secrets/hh_token" },
      { status: 400 }
    );
  }
  if (!existsSync(PYTHON_BIN)) {
    return NextResponse.json(
      { error: `Python для HH-отчетов не найден: ${PYTHON_BIN}` },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const roleMode = cleanValue(body.roleMode) === "new" ? "new" : "existing";
  const query = cleanValue(body.query) || cleanValue(body.role);
  const role = cleanValue(body.role) || query;
  const workshop = cleanValue(body.workshop);
  const subWorkshop = cleanValue(body.subWorkshop);
  const location = cleanValue(body.location) || "Москва";
  const area = cleanValue(body.area) || "1";
  const grade = cleanValue(body.grade) || "all";
  const stack = cleanValue(body.stack);
  const pages = positiveInt(body.pages, 1, 10);
  const period = cleanValue(body.period) || new Date().toISOString().slice(0, 7);
  const triggerType = cleanValue(body.triggerType) === "monthly" ? "monthly" : "on_demand";

  if (!query || !role) {
    return NextResponse.json(
      { error: "Выберите существующую роль или укажите новую" },
      { status: 400 }
    );
  }

  if (!workshop || !subWorkshop) {
    return NextResponse.json(
      { error: "Роль для HH-аналитики должна быть привязана к цеху и подцеху" },
      { status: 400 }
    );
  }

  const hhAccessToken = readFileSync(TOKEN_PATH, "utf-8").trim();
  if (!hhAccessToken) {
    return NextResponse.json(
      { error: "HH token file is empty: secrets/hh_token" },
      { status: 400 }
    );
  }

  const env = {
    ...process.env,
    HH_ACCESS_TOKEN: hhAccessToken,
  };

  try {
    const collect = await runPython(
      [
        "hh_salary_collector.py",
        "--text",
        query,
        "--area",
        area,
        "--pages",
        String(pages),
      ],
      env
    );

    const snapshot = await runPython(
      [
        "salary_metrics.py",
        "snapshot",
        "--trigger-type",
        triggerType,
        "--period",
        period,
        "--query",
        query,
        "--role",
        role,
        "--location",
        location,
        "--grade",
        grade,
        "--stack",
        stack,
        "--workshop",
        workshop,
        "--sub-workshop",
        subWorkshop,
        "--notes",
        `Создано из интерфейса сервиса кнопкой Посмотреть ЗП в HH; mode=${roleMode}`,
      ],
      env
    );

    const report = await runPython(["build_salary_report.py", "--from-metrics"], env);

    return NextResponse.json(
      {
        ok: true,
        query,
        role,
        roleMode,
        workshop,
        subWorkshop,
        location,
        area,
        grade,
        stack,
        pages,
        period,
        triggerType,
        collect: collect.stdout,
        snapshot: snapshot.stdout,
        report: report.stdout,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown HH sync error";
    const stdout = typeof error === "object" && error && "stdout" in error ? String(error.stdout) : "";
    const stderr = typeof error === "object" && error && "stderr" in error ? String(error.stderr) : "";

    return NextResponse.json(
      {
        error: message,
        stdout,
        stderr,
      },
      { status: 500 }
    );
  }
}
