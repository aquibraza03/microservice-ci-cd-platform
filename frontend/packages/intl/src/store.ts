import type { IntlDir, Locale } from "./types";
import { getIntlDir } from "./types";
import { enMessages } from "./messages/en";

/**
 * Locale store.
 *
 * Module-level singleton deliberately avoids React Context so that:
 *   - server components can read the active locale synchronously via `t()`;
 *   - React Context stays reserved for Auth / Theme / App Config;
 *   - locale switching re-renders only subscribed consumers.
 *
 * This module is React-hook free (safe to import from Server Components).
 * The reactive `useIntlState` hook lives in `./hooks` (a Client Component).
 */

/** The canonical message shape (all locales must satisfy it). */
export type Messages = typeof enMessages;

/** Any key of the canonical message dictionary. */
export type MessageKey = keyof Messages;

export type IntlState = {
  locale: Locale;
  dir: IntlDir;
  messages: Messages;
};

let state: IntlState = { locale: "en", dir: "ltr", messages: enMessages };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to locale changes (used by `useSyncExternalStore`). */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Immutable snapshot of the current locale state. */
export function getSnapshot(): IntlState {
  return state;
}

/** Update the active locale and/or dictionary. Emits to subscribers. */
export function configureIntl(next: Partial<Omit<IntlState, "dir">> & { dir?: IntlDir }): void {
  const locale = next.locale ?? state.locale;
  const dir = next.dir ?? getIntlDir(locale);
  state = { locale, dir, messages: next.messages ?? state.messages };
  emit();
}

/** Current locale state (server + client safe). */
export function getIntlState(): IntlState {
  return state;
}

/** Best-effort locale detection from the browser (falls back to `en`). */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const raw = navigator.language || "en";
  return (raw.split("-")[0] ?? "en").toLowerCase();
}

/** Interpolate `{name}` placeholders with the provided params. */
export function translate(
  messages: Messages,
  key: keyof Messages,
  params?: Record<string, string | number>
): string {
  const template = messages[key] ?? String(key);
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Non-hook translation accessor (works in server components). */
export function t(key: keyof Messages, params?: Record<string, string | number>): string {
  return translate(getIntlState().messages, key, params);
}
