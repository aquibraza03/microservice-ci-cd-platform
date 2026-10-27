/**
 * Formatting helpers. Locale-aware, dependency-light.
 * Locale-aware formatters accept an optional locale (default: `en-US`);
 * the internationalization layer binds these to the active UI locale.
 */

export const DEFAULT_LOCALE = "en-US";

function intlNumber(locale: string, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, options);
}

/** Format a number with grouping separators. */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale: string = DEFAULT_LOCALE
): string {
  return intlNumber(locale, options).format(value);
}

/** Format a number as a percentage (0..1 -> 0..100). */
export function formatPercent(
  value: number,
  fractionDigits = 0,
  locale: string = DEFAULT_LOCALE
): string {
  return intlNumber(locale, { style: "percent", maximumFractionDigits: fractionDigits }).format(
    value
  );
}

/** Format currency. */
export function formatCurrency(
  value: number,
  currency = "USD",
  locale: string = DEFAULT_LOCALE
): string {
  return intlNumber(locale, { style: "currency", currency }).format(value);
}

/** Format a byte count into a human readable size. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exponent = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const scaled = bytes / 2 ** (exponent * 10);
  return `${scaled.toFixed(exponent === 0 ? 0 : fractionDigits)} ${units[exponent]}`;
}

/** Format a millisecond duration into a human readable string. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
}

/** Format a date using the given locale. */
export function formatDate(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
  locale: string = DEFAULT_LOCALE
): string {
  return new Intl.DateTimeFormat(locale, options).format(new Date(date));
}

/** Format a date/time. */
export function formatDateTime(
  date: Date | string | number,
  locale: string = DEFAULT_LOCALE
): string {
  return formatDate(
    date,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    },
    locale
  );
}

/** Human-friendly relative time (e.g. "3 minutes ago"). */
export function formatRelativeTime(
  date: Date | string | number,
  now: number = Date.now(),
  locale: string = DEFAULT_LOCALE
): string {
  const target = new Date(date).getTime();
  const delta = now - target;
  const absolute = Math.abs(delta);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["week", 7 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
    ["second", 1000]
  ];

  for (const [unit, unitMs] of units) {
    if (absolute >= unitMs) {
      return rtf.format(Math.round(delta / unitMs), unit);
    }
  }
  return "now";
}

/** Format a duration since an epoch timestamp (e.g. uptime). */
export function formatUptime(since: number, now: number = Date.now()): string {
  return formatDuration(Math.max(0, now - since));
}
