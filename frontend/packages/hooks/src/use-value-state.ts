import { useEffect, useRef, useState } from "react";

/** Returns the debounced value after `delayMs` of quiet time. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/** Track the previous render's value. */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/** Whether the current render is the first one. */
export function useIsFirstRender(): boolean {
  const ref = useRef(true);
  const isFirst = ref.current;
  ref.current = false;
  return isFirst;
}

/** True once mounted in the browser. */
export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
