import { useCallback, useEffect, useRef, useState } from "react";

/** Open/close/toggle state primitive for dialogs, drawers, popovers. */
export function useDisclosure(initialOpen = false) {
  const [isOpen, setOpen] = useState(initialOpen);

  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  return { isOpen, setOpen, open, close, toggle };
}

/** Run `callback` on every interval while enabled. */
export function useInterval(callback: () => void, delayMs: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return;
    const id = window.setInterval(() => savedCallback.current(), delayMs);
    return () => window.clearInterval(id);
  }, [delayMs]);
}

/** Attach a DOM event listener with automatic cleanup. */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  element: HTMLElement | Window | null = typeof window !== "undefined" ? window : null
): void {
  useEffect(() => {
    if (!element) return;
    element.addEventListener(eventName, handler as EventListener);
    return () => element.removeEventListener(eventName, handler as EventListener);
  }, [eventName, handler, element]);
}

/** Copy text to the clipboard with a transient success signal. */
export function useCopyToClipboard(
  resetMs = 2000
): [copied: boolean, copy: (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), resetMs);
      } catch {
        setCopied(false);
      }
    },
    [resetMs]
  );

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  return [copied, copy];
}
