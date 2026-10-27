import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatUptime
} from "@saas/utils";
import type { Locale } from "./types";

/**
 * Locale-aware formatter factory.
 * Wraps the single formatting implementation in `@saas/utils` and binds it to
 * the active UI locale, so call sites never pass a locale around.
 */
export function createFormatters(locale: Locale) {
  return {
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumber(value, options, locale),
    formatPercent: (value: number, fractionDigits?: number) =>
      formatPercent(value, fractionDigits, locale),
    formatCurrency: (value: number, currency?: string) => formatCurrency(value, currency, locale),
    formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      formatDate(date, options, locale),
    formatDateTime: (date: Date | string | number) => formatDateTime(date, locale),
    formatRelativeTime: (date: Date | string | number, now?: number) =>
      formatRelativeTime(date, now, locale),
    formatBytes,
    formatDuration,
    formatUptime
  };
}

export type AppFormatters = ReturnType<typeof createFormatters>;
