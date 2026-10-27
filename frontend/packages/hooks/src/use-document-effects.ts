import { useEffect, useCallback } from "react";

/** Set the document title (with an optional suffix). */
export function useDocumentTitle(title: string, suffix?: string): void {
  useEffect(() => {
    document.title = suffix ? `${title} — ${suffix}` : title;
  }, [title, suffix]);
}

/**
 * Dispatch a custom event. Useful for decoupled cross-feature signaling
 * (e.g. "open global search") without coupling features to each other.
 */
export function useDispatchEvent<T>(eventName: string): (detail?: T) => void {
  return useCallback(
    (detail?: T) => {
      window.dispatchEvent(new CustomEvent<T>(eventName, { detail }));
    },
    [eventName]
  );
}

/** Subscribe to a custom event emitted by `useDispatchEvent`. */
export function useSubscribeEvent<T>(eventName: string, handler: (detail: T) => void): void {
  useEffect(() => {
    const listener = (event: Event) => handler((event as CustomEvent<T>).detail as T);
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }, [eventName, handler]);
}
