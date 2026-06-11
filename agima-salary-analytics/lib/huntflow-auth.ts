import { HuntflowClient } from "./huntflow-client";

const BASE_URL = process.env.HUNTFLOW_API_BASE_URL || "https://api.huntflow.ru/v2";
const REDIS_TOKEN_KEY = "agima-zp-analytics:huntflow-token";

type HuntflowStoredToken = {
  accessToken: string;
  refreshToken: string;
  updatedAt: string;
  accessTokenExpiresIn?: number;
  refreshTokenExpiresIn?: number;
};

type HuntflowRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
};

type HuntflowAuth = {
  accessToken: string;
  refreshToken: string;
  accountId: number;
};

function redisConfig() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_API_TOKEN;

  return url && token ? { url, token } : null;
}

async function redisCommand<T>(command: unknown[]): Promise<T | null> {
  const config = redisConfig();
  if (!config) return null;

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Redis storage error ${response.status}: ${details}`);
  }

  const data = (await response.json()) as { result?: T; error?: string };
  if (data.error) throw new Error(`Redis storage error: ${data.error}`);
  return data.result ?? null;
}

function parseStoredToken(value: string | null): HuntflowStoredToken | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<HuntflowStoredToken>;
    if (!parsed.accessToken || !parsed.refreshToken) return null;

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      accessTokenExpiresIn: parsed.accessTokenExpiresIn,
      refreshTokenExpiresIn: parsed.refreshTokenExpiresIn,
    };
  } catch {
    return null;
  }
}

async function loadStoredToken(): Promise<HuntflowStoredToken | null> {
  const value = await redisCommand<string>(["GET", REDIS_TOKEN_KEY]);
  return parseStoredToken(value);
}

async function saveStoredToken(token: HuntflowStoredToken): Promise<void> {
  await redisCommand(["SET", REDIS_TOKEN_KEY, JSON.stringify(token)]);
}

async function refreshHuntflowToken(refreshToken: string): Promise<HuntflowStoredToken> {
  const response = await fetch(`${BASE_URL}/token/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Huntflow token refresh error: ${response.status} ${response.statusText}${
        details ? `: ${details.slice(0, 500)}` : ""
      }`
    );
  }

  const data = (await response.json()) as HuntflowRefreshResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Huntflow token refresh returned an incomplete token pair");
  }

  const token = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    updatedAt: new Date().toISOString(),
    accessTokenExpiresIn: data.expires_in,
    refreshTokenExpiresIn: data.refresh_token_expires_in,
  };
  await saveStoredToken(token);

  return token;
}

export async function getHuntflowAuth(): Promise<HuntflowAuth | null> {
  const accountId = Number(process.env.HUNTFLOW_ACCOUNT_ID);
  if (!Number.isInteger(accountId) || accountId < 1) return null;

  const stored = await loadStoredToken();
  const accessToken = stored?.accessToken || process.env.HUNTFLOW_API_TOKEN || "";
  const refreshToken =
    stored?.refreshToken || process.env.HUNTFLOW_REFRESH_TOKEN || "";

  if (!accessToken && refreshToken) {
    const refreshed = await refreshHuntflowToken(refreshToken);
    return {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      accountId,
    };
  }

  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken, accountId };
}

export async function createHuntflowClient(): Promise<HuntflowClient | null> {
  const auth = await getHuntflowAuth();
  if (!auth) return null;

  const refreshAccessToken = createRefreshAccessToken(auth.refreshToken);
  return new HuntflowClient(auth.accessToken, auth.accountId, {
    refreshAccessToken,
  });
}

export function createRefreshAccessToken(initialRefreshToken: string) {
  let refreshToken = initialRefreshToken;

  return async () => {
    const refreshed = await refreshHuntflowToken(refreshToken);
    refreshToken = refreshed.refreshToken;
    return refreshed.accessToken;
  };
}
