/**
 * Runtime environment guards.
 */

export const isBrowser = (): boolean => typeof window !== "undefined";

export const isServer = (): boolean => typeof window === "undefined";

export function isWindowDefined(): boolean {
  return typeof window !== "undefined";
}

/** Detect reduced-motion preference. */
export function prefersReducedMotion(): boolean {
  if (!isBrowser()) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
