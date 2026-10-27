import { useCallback, useEffect, useState } from "react";
import { storage } from "@saas/utils";

/**
 * State persisted to localStorage with optional TTL.
 * SSR-safe; the persisted value is only applied after mount to avoid hydration
 * mismatches.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: { ttlMs?: number } = {}
): [T, (value: T | ((previous: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    const stored = storage.get<T>(key, null);
    if (stored !== null) {
      setValue(stored);
    }
  }, [key]);

  const set = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(previous) : next;
        storage.set(key, resolved, options);
        return resolved;
      });
    },
    [key, options]
  );

  const remove = useCallback(() => {
    storage.remove(key);
    setValue(initialValue);
  }, [key, initialValue]);

  return [value, set, remove];
}
