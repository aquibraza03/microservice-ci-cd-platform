"use client";

import { useTheme } from "next-themes";

export type { ThemeProviderProps } from "next-themes";

export type { ThemeMode } from "./provider";

/**
 * Typed theme hook. Thin wrapper over next-themes so feature code and the app
 * never import `next-themes` directly — the theme feature owns that boundary.
 */
export function useAppTheme() {
  return useTheme();
}
