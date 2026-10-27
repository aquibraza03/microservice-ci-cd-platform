"use client";

import { useEffect } from "react";
import { configureIntl, detectLocale, getIntlDir } from "@saas/intl";

/**
 * Client-side locale bootstrap.
 *
 * Detects the browser language on mount, configures the locale store, and
 * mirrors `lang`/`dir` onto the document element (enabling RTL at runtime).
 * Server-rendered output stays on the default locale — switching to full SSR
 * i18n (middleware/cookie-based locale resolution) is a documented production
 * enhancement that does not require an architectural change.
 */
export function IntlBootstrap() {
  useEffect(() => {
    const locale = detectLocale();
    configureIntl({ locale });
    document.documentElement.lang = locale;
    document.documentElement.dir = getIntlDir(locale);
  }, []);

  return null;
}
