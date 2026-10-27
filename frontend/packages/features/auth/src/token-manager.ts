import type { TokenBundle } from "@saas/types";
import type { TokenStore } from "@saas/services";
import type { TokenPersistence } from "./persistence";

/**
 * Token manager implementing the API client's `TokenStore` contract.
 *
 * Owns the in-memory token state and its persistence, and knows how to trigger
 * a single-flight refresh. The actual refresh HTTP call is injected as a task
 * (breaking the otherwise circular dependency between the API client, the
 * strategy, and the auth service).
 */
export class TokenManager implements TokenStore {
  private tokens: TokenBundle = { accessToken: null, refreshToken: null };
  private refreshTask: (() => Promise<void>) | null = null;

  constructor(
    private readonly persistence: TokenPersistence,
    private readonly onSessionExpired?: () => void
  ) {}

  /** Inject the refresh task after the strategy is created. */
  setRefreshTask(task: () => Promise<void>): void {
    this.refreshTask = task;
  }

  /** Restore a persisted session (no-op outside the browser). */
  restore(): TokenBundle {
    this.tokens = this.persistence.read();
    return this.tokens;
  }

  getAccessToken(): string | null {
    return this.tokens.accessToken;
  }

  getRefreshToken(): string | null {
    return this.tokens.refreshToken;
  }

  accessTokenExpired(): boolean {
    const { accessToken, expiresAt } = this.tokens;
    if (accessToken === null) return false;
    if (expiresAt === null || expiresAt === undefined) return false;
    return Date.now() >= expiresAt;
  }

  getTokens(): TokenBundle {
    return { ...this.tokens };
  }

  setTokens(tokens: TokenBundle): void {
    this.tokens = { ...tokens };
    this.persistence.write(this.tokens);
  }

  clear(): void {
    this.tokens = { accessToken: null, refreshToken: null };
    this.persistence.clear();
  }

  /** Called by the API client's refresh coordinator. */
  async refresh(): Promise<void> {
    if (this.refreshTask === null) {
      throw new Error("Auth refresh is not configured.");
    }
    try {
      await this.refreshTask();
    } catch (error) {
      this.onSessionExpired?.();
      throw error;
    }
  }
}
