type ParseResult = {
  from: number | null;
  to: number | null;
  currency: string;
  raw: string;
};

// ---- Курсы валют (кэш на сессию) ----
let ratesCache: Record<string, number> | null = null;
let ratesCacheTime = 0;
const RATES_TTL = 60 * 60 * 1000;

const FALLBACK_RATES: Record<string, number> = {
  RUB: 1,
  RUR: 1,
  USD: 90,
  EUR: 98,
  USDT: 90,
  KZT: 0.18,
  BYN: 27,
  UZS: 0.007,
  GEL: 33,
  AZN: 53,
  AMD: 0.22,
  KGS: 1.0,
  TJS: 8.3,
  TMT: 26,
  TRY: 2.8,
  GBP: 114,
  CNY: 12.4,
  JPY: 0.6,
  KRW: 0.065,
  THB: 2.5,
};

// Все допустимые обозначения валют → стандартный код
const CURRENCY_ALIASES: Record<string, string> = {
  RUB: "RUB", RUR: "RUB", РУБ: "RUB", РУБЛЬ: "RUB", РУБЛЯ: "RUB", РУБЛЕЙ: "RUB", "₽": "RUB",
  USD: "USD", DOLLAR: "USD", "$": "USD",
  EUR: "EUR", ЕВРО: "EUR", "€": "EUR",
  USDT: "USD",
  KZT: "KZT", ТЕНГЕ: "KZT",
  BYN: "BYN",
  UZS: "UZS",
  GEL: "GEL",
  AZN: "AZN",
  AMD: "AMD",
  KGS: "KGS",
  TJS: "TJS",
  TMT: "TMT",
  TRY: "TRY",
  GBP: "GBP",
  CNY: "CNY",
  JPY: "JPY",
  KRW: "KRW",
  THB: "THB", БАТ: "THB",
};

// Регулярка для поиска кода валюты в строке
const CURRENCY_CODES = Object.keys(CURRENCY_ALIASES)
  .sort((a, b) => b.length - a.length)
  .map((c) => c.replace("$", "\\$").replace("€", "\\€").replace("₽", "\\₽"))
  .join("|");
const CURRENCY_RE = new RegExp(`\\s*(?:${CURRENCY_CODES})\\s*$`, "gi");

async function getRates(): Promise<Record<string, number>> {
  if (ratesCache && Date.now() - ratesCacheTime < RATES_TTL) {
    return ratesCache;
  }
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/RUB", {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data?.rates) {
      const rates: Record<string, number> = { RUB: 1, RUR: 1 };
      for (const [code, rate] of Object.entries(data.rates)) {
        rates[code] = 1 / (rate as number);
      }
      ratesCache = rates;
      ratesCacheTime = Date.now();
      return rates;
    }
  } catch {
    // fallback ниже
  }
  ratesCache = FALLBACK_RATES;
  ratesCacheTime = Date.now();
  return FALLBACK_RATES;
}

async function convertToRUB(amount: number, currency: string): Promise<number> {
  const code = CURRENCY_ALIASES[currency.toUpperCase()] || currency.toUpperCase();
  if (code === "RUB") return amount;
  const rates = await getRates();
  const rate = rates[code];
  return rate ? Math.round(amount * rate) : amount;
}

function detectCurrency(text: string): string | null {
  const upper = text.toUpperCase().trim();
  // Проверяем символы
  if (upper.includes("₽")) return "RUB";
  if (upper.includes("$")) return "USD";
  if (upper.includes("€")) return "EUR";
  // Ищем код в конце строки
  const match = upper.match(/([A-ZА-Я]{2,5})\s*$/);
  if (match) {
    const code = CURRENCY_ALIASES[match[1]];
    if (code) return code;
  }
  return null;
}

function extractNumber(s: string): number | null {
  // Убираем пробелы (тысячные разделители)
  let cleaned = s.replace(/\s/g, "");
  // "150,5" → 150.5
  if (/,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(",", ".");
  } else {
    cleaned = cleaned.replace(",", "");
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function isEmptyIndicator(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const indicators = [
    "договорная", "договорен", "не указана", "не указано",
    "неопределена", "нд", "без зп", "без зарплаты",
  ];
  return indicators.some((ind) => lower.includes(ind));
}

/**
 * Основной парсер зарплат из текста.
 *
 * Приоритет:
 * 1. Число с кодом валюты: "150000 RUR", "5000 USD"
 * 2. Диапазон с валютой: "150000-200000 RUR", "от 150000 до 200000 RUR"
 * 3. Просто число (считается рублями): "150000"
 * 4. Форматы с множителями: "150к", "1.5 млн"
 */
export async function parseSalary(text: string): Promise<ParseResult | null> {
  if (!text || !text.trim()) return null;
  if (isEmptyIndicator(text)) return null;

  const original = text;
  const rawCurrency = detectCurrency(text);
  const currencyCode = rawCurrency || "RUB";

  // Убираем обозначение валюты из текста для парсинга чисел
  const cleanText = text.replace(CURRENCY_RE, "").trim();

  // 1. Диапазон: "150000 - 200000" или "от 150000 до 200000"
  const rangeMatch = cleanText.match(
    /(?:от\s+)?([\d\s,.]+(?:\s*(?:тыс|млн)\.?)?)\s*(?:до|-|–|—)\s*([\d\s,.]+(?:\s*(?:тыс|млн)\.?)?)/i
  );
  if (rangeMatch) {
    const fromNum = extractNumber(rangeMatch[1]);
    const toNum = extractNumber(rangeMatch[2]);
    if (fromNum !== null && toNum !== null) {
      const fromMult = /млн/i.test(rangeMatch[1]) ? 1_000_000 : /тыс|к/i.test(rangeMatch[1]) ? 1_000 : 1;
      const toMult = /млн/i.test(rangeMatch[2]) ? 1_000_000 : /тыс|к/i.test(rangeMatch[2]) ? 1_000 : 1;
      const fromRUB = await convertToRUB(Math.round(fromNum * fromMult), currencyCode);
      const toRUB = await convertToRUB(Math.round(toNum * toMult), currencyCode);
      if (fromRUB >= 1 && toRUB >= 1 && fromRUB <= toRUB * 10) {
        return { from: fromRUB, to: toRUB, currency: "RUB", raw: original };
      }
    }
  }

  // 2. Простое число (с опциональным множителем)
  // Убираем множители для чистого парсинга
  let multText = cleanText;
  let multiplier = 1;
  if (/млн/i.test(multText)) {
    multiplier = 1_000_000;
    multText = multText.replace(/млн\.?/gi, "").trim();
  } else if (/тыс\.?|тысяч/i.test(multText)) {
    multiplier = 1_000;
    multText = multText.replace(/тыс\.?|тысяч/gi, "").trim();
  }

  const simpleNum = extractNumber(multText);
  if (simpleNum !== null) {
    const rawAmount = Math.round(simpleNum * multiplier);
    const inRUB = await convertToRUB(rawAmount, currencyCode);
    // Принимаем любую осмысленную сумму
    if (inRUB >= 1 && inRUB <= 100_000_000) {
      return { from: inRUB, to: inRUB, currency: "RUB", raw: original };
    }
  }

  // 3. Формат "150к" (число + к без пробела)
  const kMatch = cleanText.match(/([\d,.]+)\s*к\b/i);
  if (kMatch) {
    const num = extractNumber(kMatch[1]);
    if (num !== null) {
      const inRUB = await convertToRUB(Math.round(num * 1_000), currencyCode);
      if (inRUB >= 1 && inRUB <= 100_000_000) {
        return { from: inRUB, to: inRUB, currency: "RUB", raw: original };
      }
    }
  }

  // 4. Поиск с контекстными словами: "зарплата 180000", "оклад: 150000"
  const contextMatch = cleanText.match(
    /(?:зарплат\w*|зп|оклад\w*|доход\w*|ожидан\w*|желаем\w*|ставк\w*)\s*[:\-—]?\s*(?:от\s+)?([\d\s,.]+(?:\s*(?:тыс|млн)\.?)?)/i
  );
  if (contextMatch) {
    const num = extractNumber(contextMatch[1]);
    if (num !== null) {
      const ctxMult = /млн/i.test(contextMatch[1]) ? 1_000_000 : /тыс|к/i.test(contextMatch[1]) ? 1_000 : 1;
      const inRUB = await convertToRUB(Math.round(num * ctxMult), currencyCode);
      if (inRUB >= 1 && inRUB <= 100_000_000) {
        return { from: inRUB, to: inRUB, currency: "RUB", raw: original };
      }
    }
  }

  return null;
}

/**
 * Парсит числовую зарплату из структурного поля (Huntflow API)
 */
export async function parseStructuredSalary(
  salary: number | null | undefined,
  currency?: string
): Promise<{ from: number; to: number } | null> {
  if (!salary || salary <= 0) return null;
  const curr = currency
    ? CURRENCY_ALIASES[currency.toUpperCase()] || currency.toUpperCase()
    : "RUB";
  const inRUB = await convertToRUB(salary, curr);
  if (inRUB < 1 || inRUB > 100_000_000) return null;
  return { from: inRUB, to: inRUB };
}
