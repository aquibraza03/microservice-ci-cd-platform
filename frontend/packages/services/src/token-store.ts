import type { TokenBundle } from "@saas/types";

/**
 * Token store contract implemented by the auth feature and injected into the
 * API client. The API layer depends on this interface — never on the auth UI —
 * keeping the two decoupled.
 */
export interface TokenStore {
  /** Current access token, if any. */
  getAccessToken(): string | null;

  /** Current refresh token, if any. */
  getRefreshToken(): string | null;

  /** Whether the access token is present but expired. */
  accessTokenExpired(): boolean;

  /**
   * Refresh the session. Must be single-flight: concurrent callers receive the
   * same promise. Resolves when the new tokens are stored, rejects on failure.
   */
  refresh(): Promise<void>;

  /** Persist a fresh token bundle. */
  setTokens(tokens: TokenBundle): void;

  /** Drop all tokens (logout). */
  clear(): void;
}
