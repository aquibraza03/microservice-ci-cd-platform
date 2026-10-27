/** Storage keys and event names used by the auth feature. */
export const AUTH_STORAGE_KEYS = {
  TOKENS: "auth.tokens",
  SESSION: "auth.session"
} as const;

export const AUTH_EVENTS = {
  SESSION_EXPIRED: "auth:session-expired",
  SESSION_CHANGED: "auth:session-changed"
} as const;

/** Redirect search-param key used to return to the originally requested page. */
export const AUTH_REDIRECT_PARAM = "next";

/** Development-only auth providers (never active in production). */
export const DEV_PROVIDERS = ["dev", "guest"] as const;
