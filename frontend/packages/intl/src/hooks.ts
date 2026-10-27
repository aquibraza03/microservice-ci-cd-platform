"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { MessageParams } from "./types";
import { createFormatters } from "./formatters";
import { getSnapshot, subscribe, translate, type IntlState, type Messages } from "./store";

/**
 * Reactive locale state for client components.
 * Kept in a dedicated Client Component module so Server Components can import
 * the hook-free store without triggering Next's client-hook boundary.
 */
export function useIntlState(): IntlState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Reactive i18n hook for client components.
 *
 * Returns the translation function bound to the current dictionary plus the
 * active locale/direction and locale-aware formatters. Server components use
 * the non-hook `t()` accessor instead.
 */
export function useI18n() {
  const { locale, dir, messages } = useIntlState();

  const t = useMemo(
    () => (key: keyof Messages, params?: MessageParams) => translate(messages, key, params),
    [messages]
  );

  const formatters = useMemo(() => createFormatters(locale), [locale]);

  return { t, locale, dir, ...formatters };
}

export type UseI18nResult = ReturnType<typeof useI18n>;
