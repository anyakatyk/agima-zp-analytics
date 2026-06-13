import type { HuntflowRawExportRow } from "./huntflow-client";

export type MiddlewareVacancy = {
  id: number;
  name: string;
  status?: string;
};

const REQUEST_TIMEOUT_MS = 120_000;

function middlewareConfig() {
  const url = process.env.HUNTFLOW_MIDDLEWARE_URL?.replace(/\/$/, "");
  const token = process.env.HUNTFLOW_MIDDLEWARE_TOKEN;

  return url ? { url, token } : null;
}

export function isHuntflowMiddlewareEnabled(): boolean {
  return Boolean(middlewareConfig());
}

async function requestMiddleware<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const config = middlewareConfig();
  if (!config) throw new Error("Huntflow middleware is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.url}${path}`, {
      ...options,
      signal: options?.signal || controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        ...options?.headers,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Huntflow middleware error: ${response.status} ${response.statusText}${
          details ? `: ${details.slice(0, 500)}` : ""
        }`
      );
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Huntflow middleware timeout after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMiddlewareVacancies(): Promise<MiddlewareVacancy[]> {
  const data = await requestMiddleware<{ vacancies?: MiddlewareVacancy[] } | MiddlewareVacancy[]>(
    "/vacancies"
  );

  return Array.isArray(data) ? data : data.vacancies || [];
}

export async function getMiddlewareExportRows(
  vacancyIds?: number[]
): Promise<HuntflowRawExportRow[]> {
  const data = await requestMiddleware<{ rows?: HuntflowRawExportRow[] } | HuntflowRawExportRow[]>(
    "/export-rows",
    {
      method: "POST",
      body: JSON.stringify({ vacancyIds: vacancyIds || [] }),
    }
  );

  return Array.isArray(data) ? data : data.rows || [];
}

