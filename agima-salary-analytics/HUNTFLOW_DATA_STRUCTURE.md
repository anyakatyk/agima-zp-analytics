# Huntflow data structure

Huntflow API credentials live in:

```text
.env.local
```

Required variables:

```text
HUNTFLOW_API_TOKEN=...
HUNTFLOW_ACCOUNT_ID=...
```

Optional API base override:

```text
HUNTFLOW_API_BASE_URL=https://api.huntflow.ru/v2
```

## Flow

Huntflow API is used only to download a cleaned Excel export to the user's computer.

Direct API sync into the service is disabled. The cleaned export must be uploaded manually through the file upload block.

`ФИО` is removed by the internal LLM before the app builds the Excel file.

Internal LLM defaults:

```text
INTERNAL_LLM_BASE_URL=http://192.168.153.104:11434
INTERNAL_LLM_MODEL=llama3.1:8b
```

If the internal LLM is unavailable or returns personal-data fields, the export fails closed and no cleaned file is produced.

The cleaned Huntflow export never includes `ФИО`.

## Unified analytics record

All sources are normalized to `SalaryRecord`:

```text
ФИО -> not exported from Huntflow API
Последнее место работы -> lastWorkplace
Должность -> position
Зарплата -> salaryFrom / salaryTo / rawSalaryText
Дата рождения -> birthDate
Текущий этап подбора -> status
Название вакансии -> vacancyName
Грейд -> grade
Отдел -> workshop (Цех)
Подразделение -> subWorkshop (Подцех)
Дата выгрузки -> createdAt (Дата)
```

The shared normalization logic is in:

```text
lib/salary-record-normalizer.ts
```

File upload uses this structure after the cleaned export is uploaded manually.
