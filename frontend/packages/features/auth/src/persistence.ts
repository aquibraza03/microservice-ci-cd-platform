import { storage } from "@saas/utils";
import type { TokenBundle } from "@saas/types";
import { AUTH_STORAGE_KEYS, DEV_PROVIDERS } from "./constants";

/**
 * Persistence boundary for session data.
 * Implementations may keep tokens in memory, localStorage, or cookies without
 * touching the token manager. Production providers MUST NOT persist tokens to
 * web storage — see `createTokenPersistence`.
 */
export interface TokenPersistence {
  read(): TokenBundle;
  write(tokens: TokenBundle): void;
  clear(): void;
}

/**
 * In-memory persistence (the production-safe default).
 *
 * Access + refresh tokens live only in module memory for the lifetime of the
 * page. Session restoration after a reload is delegated to the identity
 * backend: with httpOnly SameSite cookies the server re-establishes the
 * session via the `userinfo`/session endpoint, and the browser never touches
 * token material (no localStorage/sessionStorage exposure to XSS).
 */
export class MemoryTokenPersistence implements TokenPersistence {
  private tokens: TokenBundle = { accessToken: null, refreshToken: null };

  read(): TokenBundle {
    return { ...this.tokens };
  }

  write(tokens: TokenBundle): void {
    this.tokens = { ...tokens };
  }

  clear(): void {
    this.tokens = { accessToken: null, refreshToken: null };
  }
}

/**
 * Development-only persistence. Tokens for the dev/guest providers are fake
 * and never represent real credentials, so persisting them to localStorage is
 * an acceptable convenience. Never selected for production providers.
 */
export class LocalStorageTokenPersistence implements TokenPersistence {
  read(): TokenBundle {
    const tokens = storage.get<TokenBundle>(AUTH_STORAGE_KEYS.TOKENS, null);
    return tokens ?? { accessToken: null, refreshToken: null };
  }

  write(tokens: TokenBundle): void {
    storage.set(AUTH_STORAGE_KEYS.TOKENS, tokens);
  }

  clear(): void {
    storage.remove(AUTH_STORAGE_KEYS.TOKENS);
  }
}

/**
 * Production-safe persistence selection.
 *
 * Development providers may persist to localStorage for convenience; every
 * other provider (JWT, refresh-token, and future OAuth/OIDC) keeps tokens in
 * memory only. The httpOnly-cookie model is the production target — tokens are
 * then never readable by JavaScript at all.
 */
export function createTokenPersistence(provider: string): TokenPersistence {
  if ((DEV_PROVIDERS as readonly string[]).includes(provider)) {
    return new LocalStorageTokenPersistence();
  }
  return new MemoryTokenPersistence();
}
