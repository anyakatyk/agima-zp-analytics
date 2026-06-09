import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME, getUserFromPayload } from "@/lib/auth";
import { canUploadData } from "@/lib/security/access-control";
import { logAuditEvent } from "@/lib/security/audit-log";
import { createBatch } from "@/lib/upload-batches";
import { autoDetectColumns, rowToSalaryRecord } from "@/lib/salary-record-normalizer";
import type { SalaryRecord } from "@/lib/types";
import Papa from "papaparse";
import * as XLSX from "xlsx";

// GET — список загрузок
export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { getAllBatches } = await import("@/lib/upload-batches");
  const batches = getAllBatches();

  return NextResponse.json({ batches });
}

// POST — загрузка файла
export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const user = getUserFromPayload(payload);

  if (!canUploadData(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const columnMappingRaw = formData.get("columnMapping") as string;
    const departmentOverride = formData.get("department") as string;
    const workshopOverride = formData.get("workshop") as string;
    const subWorkshopOverride = formData.get("subWorkshop") as string;
    const techStackOverride = formData.get("techStack") as string;
    const gradeOverride = formData.get("grade") as string;

    if (!file) {
      return NextResponse.json(
        { error: "Файл не загружен" },
        { status: 400 }
      );
    }

    const columnMapping: Record<string, string> = columnMappingRaw
      ? JSON.parse(columnMappingRaw)
      : {};

    const ext = file.name.split(".").pop()?.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let rows: Record<string, string>[] = [];

    if (ext === "csv") {
      const text = buffer.toString("utf-8");
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
      });
      rows = result.data as Record<string, string>[];
    } else if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
    } else {
      return NextResponse.json(
        { error: "Поддерживаются только CSV и Excel файлы" },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Файл пуст или не содержит данных" },
        { status: 400 }
      );
    }

    // Если маппинг не передан — определяем автоматически
    const headers = Object.keys(rows[0]);
    let finalMapping = columnMapping;

    if (Object.keys(finalMapping).length === 0) {
      const { mapping } = autoDetectColumns(headers);
      finalMapping = mapping;
    }

    // Конвертируем строки в записи
    const records: SalaryRecord[] = [];
    for (let index = 0; index < rows.length; index++) {
      const record = await rowToSalaryRecord(
        rows[index],
        finalMapping,
        {
          departmentOverride: departmentOverride || "",
          workshopOverride: workshopOverride || "",
          subWorkshopOverride: subWorkshopOverride || "",
          techStackOverride: techStackOverride || "",
          gradeOverride: gradeOverride || "",
        },
        index
      );
      records.push(record);
    }

    // Создаём batch
    const batch = createBatch({
      fileName: file.name,
      uploadedBy: user.name,
      records,
      columnMapping: finalMapping,
      workshopOverride: workshopOverride || undefined,
      subWorkshopOverride: subWorkshopOverride || undefined,
      techStackOverride: techStackOverride || undefined,
      departmentOverride: departmentOverride || undefined,
      gradeOverride: gradeOverride || undefined,
    });

    // Аудит
    logAuditEvent({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "upload_csv",
      details: `Загружен файл ${file.name}, ${records.length} записей, batch: ${batch.id}`,
    });

    return NextResponse.json({
      batch,
      columns: headers,
      autoMapping: finalMapping,
    });
  } catch {
    return NextResponse.json(
      { error: "Ошибка обработки файла" },
      { status: 500 }
    );
  }
}
