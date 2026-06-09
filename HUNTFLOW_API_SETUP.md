# Huntflow API

## Куда положить токен

Создайте файл:

```text
secrets/huntflow_token
```

Внутри должна быть только одна строка:

```text
ваш_токен_huntflow
```

Без кавычек, без пробелов до/после, без дополнительных комментариев.

## Как запустить выгрузку

```bash
python3 huntflow_candidates_export.py
```

По умолчанию скрипт создаст файлы в папке `outputs`:

```text
outputs/huntflow_candidates_raw_YYYYMMDD.xlsx
outputs/huntflow_candidates_analytics_YYYYMMDD.xlsx
```

В аналитическом файле колонка `ФИО` уже удалена, а поля переименованы:

```text
Отдел -> Цех
Подразделение -> Подцех
Дата выгрузки -> Дата
```

## Если нужно указать аккаунт Huntflow

Если у токена доступно несколько аккаунтов/организаций, можно передать id аккаунта:

```bash
python3 huntflow_candidates_export.py --account-id 12345
```

## Если Excel не создается

Можно выгрузить CSV:

```bash
python3 huntflow_candidates_export.py --format csv
```
