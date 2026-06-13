# Huntflow Middleware

Внутренний сервис для обезличивания данных Huntflow до передачи в аналитику.

Сервис должен запускаться внутри защищенной инфраструктуры AGIMA. Он получает полный ответ Huntflow API, но наружу отдает только whitelist-поля:

- `rowIndex`
- `lastWorkplace`
- `position`
- `salary`
- `birthDate`
- `status`
- `vacancyName`
- `grade`
- `workshop`
- `subWorkshop`
- `date`

ФИО, телефон, email, фото, ссылки и другие персональные поля в ответ сервиса не включаются.

## Переменные окружения

```bash
PORT=8787
MIDDLEWARE_TOKEN=replace-with-random-token
HUNTFLOW_ACCOUNT_ID=16438
HUNTFLOW_API_TOKEN=replace-with-current-access-token
HUNTFLOW_REFRESH_TOKEN=replace-with-current-refresh-token
HUNTFLOW_API_BASE_URL=https://api.huntflow.ru/v2
```

## Запуск

```bash
npm start
```

## Endpoint'ы

```http
GET /health
GET /vacancies
POST /export-rows
```

Для `GET /vacancies` и `POST /export-rows` нужен заголовок:

```http
Authorization: Bearer <MIDDLEWARE_TOKEN>
```

Тело `POST /export-rows`:

```json
{
  "vacancyIds": [123, 456]
}
```

Если `vacancyIds` пустой, сервис выгружает всех кандидатов.

## Подключение Vercel-приложения

В Vercel нужно добавить:

```bash
HUNTFLOW_MIDDLEWARE_URL=https://internal-middleware.example.ru
HUNTFLOW_MIDDLEWARE_TOKEN=replace-with-random-token
```

После этого Vercel-приложение будет получать вакансии и строки выгрузки из middleware, а не напрямую из Huntflow API.

