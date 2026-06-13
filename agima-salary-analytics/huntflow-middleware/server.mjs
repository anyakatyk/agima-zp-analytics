import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const HUNTFLOW_API_BASE_URL =
  process.env.HUNTFLOW_API_BASE_URL || "https://api.huntflow.ru/v2";
const HUNTFLOW_ACCOUNT_ID = Number(process.env.HUNTFLOW_ACCOUNT_ID || 0);
const MIDDLEWARE_TOKEN = process.env.MIDDLEWARE_TOKEN || "";

let accessToken = process.env.HUNTFLOW_API_TOKEN || "";
let refreshToken = process.env.HUNTFLOW_REFRESH_TOKEN || "";

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function requireAuth(req, res) {
  if (!MIDDLEWARE_TOKEN) return true;

  const expected = `Bearer ${MIDDLEWARE_TOKEN}`;
  if (req.headers.authorization === expected) return true;

  sendJson(res, 401, { error: "Unauthorized" });
  return false;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return {};
  }
}

async function refreshHuntflowToken() {
  if (!refreshToken) throw new Error("HUNTFLOW_REFRESH_TOKEN is not configured");

  const response = await fetch(`${HUNTFLOW_API_BASE_URL}/token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Huntflow token refresh error ${response.status}: ${details}`);
  }

  const data = await response.json();
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Huntflow returned an incomplete token pair");
  }

  accessToken = data.access_token;
  refreshToken = data.refresh_token;
}

async function huntflowRequest(path) {
  if (!HUNTFLOW_ACCOUNT_ID) throw new Error("HUNTFLOW_ACCOUNT_ID is not configured");
  if (!accessToken && refreshToken) await refreshHuntflowToken();
  if (!accessToken) throw new Error("HUNTFLOW_API_TOKEN is not configured");

  let response = await fetch(`${HUNTFLOW_API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401 && refreshToken) {
    await refreshHuntflowToken();
    response = await fetch(`${HUNTFLOW_API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Huntflow API error ${response.status}: ${details}`);
  }

  return response.json();
}

function asString(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function stringifySafe(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifySafe).filter(Boolean).join("; ");
  if (typeof value === "object") {
    const record = value;
    return asString(record.name) || asString(record.title) || asString(record.position);
  }
  return "";
}

function getVacancyName(vacancy) {
  return (
    asString(vacancy.position) ||
    asString(vacancy.name) ||
    asString(vacancy.title) ||
    "Без названия"
  );
}

function getDivisionName(vacancy) {
  return stringifySafe(vacancy.division || vacancy.account_division);
}

function getApplicantVacancyIds(applicant) {
  const values = [
    ...(Array.isArray(applicant.links) ? applicant.links : []),
    ...(Array.isArray(applicant.vacancies) ? applicant.vacancies : []),
  ];
  const ids = new Set();

  for (const value of values) {
    const raw = value.vacancy ?? value.vacancy_id;
    if (typeof raw === "number") ids.add(raw);
    else if (typeof raw === "string" && Number.isFinite(Number(raw))) ids.add(Number(raw));
    else if (raw && typeof raw === "object" && Number.isFinite(Number(raw.id))) {
      ids.add(Number(raw.id));
    }
  }

  return Array.from(ids);
}

function extractSalary(applicant) {
  const salary = applicant.salary || applicant.money;
  if (!salary || typeof salary !== "object") return stringifySafe(salary);

  const amount =
    salary.amount ||
    salary.money ||
    salary.value ||
    salary.from ||
    salary.to ||
    "";
  const currency =
    stringifySafe(salary.currency) ||
    asString(salary.currency_code) ||
    asString(applicant.salaryCurrency);

  return [amount, currency].filter(Boolean).join(" ");
}

function extractStatus(applicant, statusNames) {
  const status = applicant.vacancy_status || applicant.status;
  if (typeof status === "number" || typeof status === "string") {
    return statusNames[String(status)] || String(status);
  }

  return stringifySafe(status);
}

function extractGrade(vacancy) {
  const direct =
    vacancy.grade ||
    vacancy.Grade ||
    vacancy["Грейд"] ||
    vacancy.level ||
    vacancy.seniority;
  if (direct) return stringifySafe(direct);

  const containers = [
    vacancy.fields,
    vacancy.custom_fields,
    vacancy.additional_fields,
    vacancy.values,
  ].filter(Boolean);

  for (const container of containers) {
    const values = Array.isArray(container) ? container : Object.values(container);
    for (const item of values) {
      if (!item || typeof item !== "object") continue;
      const label = `${item.name || ""} ${item.title || ""} ${item.code || ""}`.toLowerCase();
      if (label.includes("грейд") || label.includes("grade")) {
        return stringifySafe(item.value || item.name || item.title);
      }
    }
  }

  return "";
}

async function getAllVacancies() {
  const vacancies = [];
  let page = 1;
  const count = 30;

  while (true) {
    const data = await huntflowRequest(
      `/accounts/${HUNTFLOW_ACCOUNT_ID}/vacancies?page=${page}&count=${count}`
    );
    const items = data.items || [];
    vacancies.push(...items);
    if (items.length < count) break;
    page++;
  }

  return vacancies;
}

async function getVacancyStatusNames() {
  try {
    const data = await huntflowRequest(
      `/accounts/${HUNTFLOW_ACCOUNT_ID}/vacancies/status_groups`
    );
    const names = {};
    for (const group of data.items || []) {
      const groupName = asString(group.name);
      for (const status of Array.isArray(group.statuses) ? group.statuses : []) {
        const id = status.account_vacancy_status || status.status || status.id;
        if (id && groupName) names[String(id)] = groupName;
      }
    }
    return names;
  } catch {
    return {};
  }
}

async function getApplicants(vacancyId) {
  const applicants = [];
  let page = 1;
  const count = 30;

  while (true) {
    const query = new URLSearchParams({
      page: String(page),
      count: String(count),
    });
    if (vacancyId) query.set("vacancy", String(vacancyId));

    const data = await huntflowRequest(
      `/accounts/${HUNTFLOW_ACCOUNT_ID}/applicants?${query.toString()}`
    );
    const items = data.items || [];
    applicants.push(...items);
    if (items.length < count) break;
    page++;
  }

  return applicants;
}

function toAllowedRow({ rowIndex, applicant, vacancy, statusNames }) {
  return {
    rowIndex,
    lastWorkplace: stringifySafe(applicant.company || applicant.experience),
    position: asString(applicant.position),
    salary: extractSalary(applicant),
    birthDate: asString(applicant.birthday || applicant.birth_date),
    status: extractStatus(applicant, statusNames),
    vacancyName: vacancy ? getVacancyName(vacancy) : "",
    grade: vacancy ? extractGrade(vacancy) : "",
    workshop: vacancy ? getDivisionName(vacancy) : "",
    subWorkshop: "",
    date: asString(applicant.created || applicant.updated || new Date().toISOString()).slice(0, 10),
  };
}

async function getExportRows(vacancyIds) {
  const vacancies = await getAllVacancies();
  const vacancyById = new Map(vacancies.map((vacancy) => [vacancy.id, vacancy]));
  const statusNames = await getVacancyStatusNames();
  const targets = Array.isArray(vacancyIds) && vacancyIds.length ? vacancyIds : [undefined];
  const rows = [];
  const addedKeys = new Set();

  for (const targetVacancyId of targets) {
    const applicants = await getApplicants(targetVacancyId);

    for (const applicant of applicants) {
      const linkedVacancyIds = getApplicantVacancyIds(applicant);
      const recordVacancyIds =
        targetVacancyId !== undefined
          ? [targetVacancyId]
          : linkedVacancyIds.length
            ? linkedVacancyIds
            : [undefined];

      for (const linkedVacancyId of recordVacancyIds) {
        const key = `${applicant.id}:${linkedVacancyId || "none"}`;
        if (addedKeys.has(key)) continue;
        addedKeys.add(key);

        rows.push(
          toAllowedRow({
            rowIndex: rows.length,
            applicant,
            vacancy: linkedVacancyId ? vacancyById.get(linkedVacancyId) : undefined,
            statusNames,
          })
        );
      }
    }
  }

  return rows;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (!requireAuth(req, res)) return;

    if (req.method === "GET" && url.pathname === "/vacancies") {
      const vacancies = await getAllVacancies();
      sendJson(res, 200, {
        vacancies: vacancies.map((vacancy) => ({
          id: vacancy.id,
          name: getVacancyName(vacancy),
          status: asString(vacancy.status),
        })),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/export-rows") {
      const body = await readBody(req);
      const vacancyIds = Array.isArray(body.vacancyIds)
        ? body.vacancyIds.map(Number).filter(Number.isFinite)
        : [];
      const rows = await getExportRows(vacancyIds);
      sendJson(res, 200, { rows });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unknown middleware error",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Huntflow middleware is listening on port ${PORT}`);
});

