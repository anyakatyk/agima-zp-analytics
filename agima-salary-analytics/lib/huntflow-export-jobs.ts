import { buildCleanHuntflowWorkbook } from "./huntflow-clean-export";

export type HuntflowExportJobStatus = "queued" | "running" | "ready" | "error";

export type HuntflowExportJob = {
  id: string;
  status: HuntflowExportJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  stage?: string;
  message?: string;
  progressCurrent?: number;
  progressTotal?: number;
  vacancyIds?: number[];
  fileName?: string;
  recordCount?: number;
  buffer?: Buffer;
  error?: string;
};

const globalForHuntflowJobs = globalThis as typeof globalThis & {
  __huntflowExportJobs?: Map<string, HuntflowExportJob>;
};

const jobs =
  globalForHuntflowJobs.__huntflowExportJobs ??
  new Map<string, HuntflowExportJob>();

globalForHuntflowJobs.__huntflowExportJobs = jobs;

export function createHuntflowExportJob(params: {
  token: string;
  accountId: number;
  vacancyIds?: number[];
}): HuntflowExportJob {
  const now = new Date().toISOString();
  const job: HuntflowExportJob = {
    id: `hf-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    stage: "queued",
    message: "Ожидает запуска",
    vacancyIds: params.vacancyIds,
  };
  jobs.set(job.id, job);

  void runJob(job.id, params);
  return sanitizeJob(job);
}

export function getHuntflowExportJob(id: string): HuntflowExportJob | undefined {
  const job = jobs.get(id);
  return job ? sanitizeJob(job) : undefined;
}

export function getHuntflowExportJobFile(id: string): HuntflowExportJob | undefined {
  return jobs.get(id);
}

async function runJob(
  id: string,
  params: { token: string; accountId: number; vacancyIds?: number[] }
) {
  const job = jobs.get(id);
  if (!job) return;

  updateJob(job, {
    status: "running",
    startedAt: new Date().toISOString(),
    stage: "start",
    message: "Запускаем выгрузку",
  });
  try {
    const result = await buildCleanHuntflowWorkbook({
      ...params,
      onProgress: (progress) => {
        updateJob(job, {
          stage: progress.stage,
          message: progress.message,
          progressCurrent: progress.current,
          progressTotal: progress.total,
        });
      },
    });
    updateJob(job, {
      status: "ready",
      finishedAt: new Date().toISOString(),
      stage: "ready",
      message: "Файл готов",
      progressCurrent: result.recordCount,
      progressTotal: result.recordCount,
      fileName: result.fileName,
      recordCount: result.recordCount,
      buffer: result.buffer,
    });
  } catch (error) {
    updateJob(job, {
      status: "error",
      finishedAt: new Date().toISOString(),
      stage: "error",
      message: "Ошибка выгрузки",
      error: error instanceof Error ? error.message : "Ошибка фоновой выгрузки",
    });
  }
}

function updateJob(
  job: HuntflowExportJob,
  patch: Partial<HuntflowExportJob>
) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function sanitizeJob(job: HuntflowExportJob): HuntflowExportJob {
  const { buffer, ...rest } = job;
  void buffer;
  return { ...rest };
}
