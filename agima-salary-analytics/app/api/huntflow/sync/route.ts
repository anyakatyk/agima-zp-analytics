import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Прямая синхронизация Huntflow отключена. Скачайте очищенную выгрузку и загрузите ее в сервис вручную.",
    },
    { status: 410 }
  );
}
