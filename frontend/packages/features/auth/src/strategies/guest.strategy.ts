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
 * Guest strategy.
 *
 * Used when authentication is disabled (`NEXT_PUBLIC_AUTH_ENABLED=false`).
 * Produces an anonymous session so the platform remains navigable without an
 * identity provider. NOT a security boundary — used for local development.
 */
export class GuestAuthStrategy implements AuthStrategy {
  readonly name = "guest" as const;

  constructor(private readonly tokenManager: TokenManager) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("GuestAuthStrategy must not be used in production.");
    }
  }

  private guestUser(): User {
    return {
      id: "guest",
      name: "Guest",
      username: "guest",
      roles: [],
      permissions: []
    };
  }

  async initialize(): Promise<Session | null> {
    this.tokenManager.restore();
    return {
      user: this.guestUser(),
      tokens: this.tokenManager.getTokens(),
      status: AuthStatus.AUTHENTICATED,
      error: null
    };
  }

  async login(_request: LoginRequest): Promise<LoginResponse> {
    throw new Error("Guest strategy does not support login.");
  }

  async logout(): Promise<void> {
    this.tokenManager.clear();
  }

  async refresh(): Promise<void> {
    this.tokenManager.clear();
  }

  async getMe(): Promise<User> {
    return this.guestUser();
  }
}
