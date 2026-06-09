# HH salary collector

Прототип сборщика зарплат из HH через официальный API, без открытия страниц резюме в браузере.

## Что собирает

- зарплата: сумма и валюта;
- возраст;
- дата обновления резюме;
- дата нахождения резюме сборщиком;
- id резюме и параметры поискового запроса.

Сборщик не имитирует действия пользователя в браузере и не обходит ограничения сайта. Он ожидает OAuth-токен HH и работает только с теми данными, к которым у аккаунта есть разрешенный доступ.

## Быстрый старт

После одобрения приложения скопируйте выданные HH значения в файлы:

```bash
secrets/hh_client_id
secrets/hh_client_secret
```

В каждом файле должна быть только одна строка без кавычек.

Получите OAuth-токен:

```bash
python3 hh_oauth.py
```

После успешной авторизации помощник сохранит токен в `secrets/hh_token`.

```bash
export HH_ACCESS_TOKEN="$(cat secrets/hh_token)"
python3 hh_salary_collector.py --text "аналитик данных" --area 1 --pages 2
```

По умолчанию данные сохраняются в `hh_salary.sqlite`.

## Примеры

Поиск по тексту:

```bash
python3 hh_salary_collector.py --text "product manager" --area 1 --pages 5
```

Свой файл базы:

```bash
python3 hh_salary_collector.py --text "python developer" --db salaries.sqlite
```

Посмотреть сохраненные записи:

```bash
python3 hh_salary_collector.py --show 20
```

## Отдельные метрики

Сырая база HH хранится в `hh_salary.sqlite`. Метрики зарплатной аналитики фиксируются отдельно в `salary_metrics.sqlite`.

Создать снимок метрик по запросу:

```bash
python3 salary_metrics.py snapshot \
  --query "аналитик данных" \
  --role "Аналитик данных" \
  --location "Москва" \
  --grade "all" \
  --stack "SQL, Python, BI"
```

Создать ежемесячный снимок:

```bash
python3 salary_metrics.py snapshot \
  --trigger-type monthly \
  --period "2026-06" \
  --query "аналитик данных" \
  --role "Аналитик данных" \
  --location "Москва" \
  --grade "all" \
  --stack "SQL, Python, BI"
```

Посмотреть последние снимки:

```bash
python3 salary_metrics.py list
```

Посмотреть группы метрик по последнему снимку:

```bash
python3 salary_metrics.py groups
```

Собрать Excel-отчет по последнему снимку метрик:

```bash
python3 build_salary_report.py --from-metrics
```

Отчет сохранится в `outputs/hh_salary_metric_report.xlsx`.

Метрика хранит:

- локацию;
- роль;
- грейд;
- стек;
- зарплату;
- возраст и возрастную группу;
- общий опыт в месяцах и годах;
- название резюме;
- форму занятости, если HH отдаст ее в поисковом ответе;
- дату изменения резюме;
- дату нахождения резюме в выборке.
- признаки `viewed`, `favorited`, `marked`.

## Полезные поля

Таблица `salary_observations` хранит сырые наблюдения. Для аналитики обычно лучше строить агрегаты поверх нее: медиана, квартили, диапазоны по роли, региону, опыту и дате обновления резюме.

## Проверка локальной LLM

Настройки лежат в `llm_config.json`:

```json
{
  "llm_base_url": "http://192.168.153.104:11434",
  "llm_model": "llama3.1:8b"
}
```

Проверить подключение:

```bash
python3 check_llm.py
```

Скрипт проверит:

- доступность `/api/tags`;
- наличие модели `llama3.1:8b`;
- ответ генерации через `/api/generate`.

Если модель не найдена, установите ее на машине с Ollama:

```bash
ollama pull llama3.1:8b
```

## LLM-обогащение метрик

После создания снимка метрик можно нормализовать роль, грейд и стек через локальную LLM. Исходные поля не перезаписываются: результат сохраняется в отдельные колонки `llm_role`, `llm_grade`, `llm_stack`, `llm_confidence`, `llm_reason`.

Проверить на трех строках без записи в базу:

```bash
python3 enrich_metrics_with_llm.py --limit 3 --dry-run
```

Записать LLM-разметку в последний снимок:

```bash
python3 enrich_metrics_with_llm.py
```

Пересобрать Excel-отчет:

```bash
python3 build_salary_report.py --from-metrics
```

## Выгрузка кандидатов из Huntflow

Скрипт `huntflow_candidates_export.py` скачивает кандидатов по вакансиям через Huntflow API и делает два файла:

- сырой файл с полями `ФИО`, `Последнее место работы`, `Должность`, `Зарплата`, `Дата рождения`, `Текущий этап подбора`, `Название вакансии`, `Грейд`, `Отдел`, `Подразделение`, `Дата выгрузки`;
- файл под шаблон аналитики, где `ФИО` полностью удалено, `Отдел` переименован в `Цех`, `Подразделение` в `Подцех`, `Дата выгрузки` в `Дата`.

Токен можно передать через переменную окружения:

```bash
export HUNTFLOW_ACCESS_TOKEN="..."
python3 huntflow_candidates_export.py
```

Или сохранить в файл `secrets/huntflow_token`.

Если в Huntflow грейд, отдел или подразделение заведены как кастомные поля с другими названиями, их можно добавить алиасами:

```bash
python3 huntflow_candidates_export.py \
  --grade-field "Уровень" \
  --department-field "Направление" \
  --subdivision-field "Команда"
```

По умолчанию результат сохраняется в `outputs/huntflow_candidates_raw_YYYYMMDD.xlsx` и `outputs/huntflow_candidates_analytics_YYYYMMDD.xlsx`.

Если на локальном Python нет библиотеки `openpyxl`, можно сохранить CSV:

```bash
python3 huntflow_candidates_export.py --format csv
```
