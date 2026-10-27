import { useCallback, useState } from "react";

/**
 * Controlled/uncontrolled value with optional fallback.
 * Implements the Radix-style `useControllableState` contract so every
 * composite component supports both controlled and uncontrolled usage.
 */
export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
  name = "component"
}: {
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  name?: string;
}): [T, (value: T | ((previous: T) => T)) => void, boolean] {
  const [internalValue, setInternalValue] = useState<T | undefined>(defaultValue);
  const isControlled = value !== undefined;

  const setValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      if (isControlled) {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(value as T) : next;
        onChange?.(resolved);
        return;
      }

      setInternalValue((previous) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(previous as T) : next;
        onChange?.(resolved);
        return resolved;
      });
    },
    [isControlled, onChange, value]
  );

  if (process.env.NODE_ENV !== "production" && isControlled && onChange === undefined) {
    // eslint-disable-next-line no-console
    console.warn(`Controlled "${name}" without an onChange handler is a no-op.`);
  }

  return [
    isControlled ? (value as T) : ((internalValue ?? defaultValue) as T),
    setValue,
    isControlled
  ];
}
