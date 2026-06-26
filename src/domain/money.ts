import type { Currency, Lang } from './model';

/** Locale used for number/date formatting based on invoice language. */
export function localeFor(lang: Lang): string {
  return lang === 'cs' ? 'cs-CZ' : 'en-US';
}

/**
 * Format a monetary amount according to language + currency.
 * cs-CZ → "1 234,00 Kč"; cs + EUR → "1 234,00 €";
 * en-US + CZK → "CZK 1,234.00"; en-US + EUR → "€1,234.00".
 */
export function formatMoney(value: number, lang: Lang, currency: Currency): string {
  const fmt = new Intl.NumberFormat(localeFor(lang), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Normalize NBSP / narrow NBSP to a regular space — Typst handles it the same
  // and it avoids surprises with font shaping.
  return fmt.format(value).replace(/ | /g, ' ');
}

/** Format a plain quantity (no currency), e.g. "1,5" in cs or "1.5" in en. */
export function formatQuantity(value: number, lang: Lang): string {
  const fmt = new Intl.NumberFormat(localeFor(lang), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
  return fmt.format(value).replace(/ | /g, ' ');
}

/** Format an ISO date (yyyy-mm-dd) as "dd. mm. yyyy" (cs) / "mm/dd/yyyy" (en). */
export function formatDate(iso: string, lang: Lang): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) return iso;
  if (lang === 'cs') {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d)}. ${pad(m)}. ${y}`;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}
