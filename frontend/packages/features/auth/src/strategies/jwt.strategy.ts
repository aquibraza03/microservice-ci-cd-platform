import type { AuthService } from "@saas/services";
import { tokensFromRefresh } from "@saas/services";
import {
  AuthStatus,
  type LoginRequest,
  type LoginResponse,
  type Session,
  type User
} from "@saas/types";
import type { TokenManager } from "../token-manager";
import type { AuthStrategy } from "./types";

/**
 * Production JWT / refresh-token strategy.
 *
 * Uses the configured auth endpoints (NEXT_PUBLIC_AUTH_*):
 *   POST {login}      -> { user, tokens }
 *   POST {refresh}    -> { accessToken, refreshToken?, expiresIn? }
 *   GET  {userinfo}   -> User
 *   POST {logout}     -> void
 */
export class JwtAuthStrategy implements AuthStrategy {
  readonly name = "jwt" as const;

  constructor(
    private readonly authService: AuthService,
    private readonly tokenManager: TokenManager
  ) {}

  async initialize(): Promise<Session | null> {
    this.tokenManager.restore();

    if (this.tokenManager.getAccessToken() === null) {
      return null;
    }

    // Proactively refresh an expired token before resolving the session.
    if (this.tokenManager.accessTokenExpired()) {
      try {
        await this.refresh();
      } catch {
        this.tokenManager.clear();
        return null;
      }
    }

    try {
      const user = await this.authService.getMe();
      return {
        user,
        tokens: this.tokenManager.getTokens(),
        status: AuthStatus.AUTHENTICATED,
        error: null
      };
    } catch {
      this.tokenManager.clear();
      return null;
    }
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    const result = await this.authService.login(request);
    this.tokenManager.setTokens(result.tokens);
    return result;
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout();
    } catch {
      // Local logout must still succeed even if the server is unreachable.
    } finally {
      this.tokenManager.clear();
    }
  }

  async refresh(): Promise<void> {
    const refreshToken = this.tokenManager.getRefreshToken();
    if (refreshToken === null) {
      throw new Error("No refresh token available.");
    }

    const response = await this.authService.refresh(refreshToken);
    const previous = this.tokenManager.getTokens();
    this.tokenManager.setTokens(tokensFromRefresh(response, previous));
  }

  async getMe(): Promise<User> {
    return this.authService.getMe();
  }
}
