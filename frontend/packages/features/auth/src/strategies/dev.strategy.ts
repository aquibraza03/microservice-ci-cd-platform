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
 * Development strategy.
 *
 * Enables local development without a running identity backend. Accepts any
 * non-empty credentials and returns a synthetic user + tokens.
 *
 * STRICTLY DEV-ONLY: construction throws in production builds so this strategy
 * can never ship in a production bundle path.
 */
export class DevAuthStrategy implements AuthStrategy {
  readonly name = "dev" as const;

  constructor(private readonly tokenManager: TokenManager) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DevAuthStrategy must not be used in production.");
    }
  }

  private devUser(login: LoginRequest): User {
    return {
      id: "dev-user",
      email: login.email,
      name: login.email.split("@")[0] ?? "Developer",
      username: login.email.split("@")[0] ?? "developer",
      roles: ["developer"],
      permissions: ["*"],
      provider: "dev"
    };
  }

  async initialize(): Promise<Session | null> {
    this.tokenManager.restore();
    const tokens = this.tokenManager.getTokens();

    if (tokens.accessToken === null) {
      return null;
    }

    return {
      user: {
        id: "dev-user",
        email: "dev@example.com",
        name: "Developer",
        username: "developer",
        roles: ["developer"],
        permissions: ["*"],
        provider: "dev"
      },
      tokens,
      status: AuthStatus.AUTHENTICATED,
      error: null
    };
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    if (!request.email || !request.password) {
      throw new Error("Email and password are required.");
    }

    const tokens = {
      accessToken: `dev.${btoa(`${request.email}:${Date.now()}`)}`,
      refreshToken: `dev.refresh.${Date.now()}`,
      expiresAt: Date.now() + 60 * 60 * 1000
    };
    this.tokenManager.setTokens(tokens);

    return { user: this.devUser(request), tokens };
  }

  async logout(): Promise<void> {
    this.tokenManager.clear();
  }

  async refresh(): Promise<void> {
    const previous = this.tokenManager.getTokens();
    this.tokenManager.setTokens({
      ...previous,
      accessToken: previous.accessToken === null ? null : `dev.${btoa(`refresh:${Date.now()}`)}`,
      expiresAt: Date.now() + 60 * 60 * 1000
    });
  }

  async getMe(): Promise<User> {
    return this.devUser({ email: "dev@example.com" } as LoginRequest);
  }
}
