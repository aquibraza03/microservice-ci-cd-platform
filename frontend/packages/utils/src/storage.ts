const STORAGE_PREFIX = "saas:";

function assertBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function withPrefix(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

type StorageOptions = {
  /** Expiry in milliseconds from write time. */
  ttlMs?: number;
};

type StoredEnvelope<T> = { value: T; expiresAt?: number };

/**
 * Safe localStorage wrapper.
 * - SSR-safe (no-op outside the browser)
 * - JSON-encoded values with optional TTL
 * - Namespaced keys (`saas:` prefix)
 * - Never throws (storage can be blocked in hardened browsers)
 */
export const storage = {
  get<T>(key: string, fallback: T | null = null): T | null {
    if (!assertBrowser()) return fallback;

    try {
      const raw = window.localStorage.getItem(withPrefix(key));
      if (raw === null) return fallback;

      const envelope = JSON.parse(raw) as StoredEnvelope<T>;
      if (envelope.expiresAt !== undefined && Date.now() > envelope.expiresAt) {
        window.localStorage.removeItem(withPrefix(key));
        return fallback;
      }

      return envelope.value as T;
    } catch {
      return fallback;
    }
  },

  set<T>(key: string, value: T, options: StorageOptions = {}): void {
    if (!assertBrowser()) return;

    try {
      const envelope: StoredEnvelope<T> = { value };
      if (options.ttlMs !== undefined) {
        envelope.expiresAt = Date.now() + options.ttlMs;
      }
      window.localStorage.setItem(withPrefix(key), JSON.stringify(envelope));
    } catch {
      /* storage unavailable — intentionally silent */
    }
  },

  remove(key: string): void {
    if (!assertBrowser()) return;
    try {
      window.localStorage.removeItem(withPrefix(key));
    } catch {
      /* intentionally silent */
    }
  },

  clear(): void {
    if (!assertBrowser()) return;
    try {
      window.localStorage.clear();
    } catch {
      /* intentionally silent */
    }
  }
};
