/**
 * Internationalization primitives: locales, text direction, and message params.
 */

/** BCP-47 language tag (e.g. `en`, `fr`, `de`). */
export type Locale = string;

/** Text direction derived from the active locale. */
export type IntlDir = "ltr" | "rtl";

/** Interpolation values passed to `t()` (e.g. `{ name }` in a template). */
export type MessageParams = Record<string, string | number>;

/** Locales that require right-to-left layout. */
export const RTL_LOCALES: ReadonlySet<string> = new Set(["ar", "he", "fa", "ur"]);

/** Resolve the text direction for a locale. */
export function getIntlDir(locale: Locale): IntlDir {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
