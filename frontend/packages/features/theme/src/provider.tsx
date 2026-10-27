"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { THEME_STORAGE_KEY } from "./constants";

export type ThemeMode = "light" | "dark" | "system";

/**
 * Theme provider.
 *
 * Wraps next-themes and applies the design-token class (`dark`) on the root
 * element. System preference resolves to light/dark automatically; the choice
 * is persisted across sessions. `disableTransitionOnChange` is kept on so the
 * theme swap does not flash a transition on first paint.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
    >
      {children}
    </NextThemesProvider>
  );
}

/** Whether the provider has mounted (used to avoid hydration mismatches). */
export function useThemeReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
