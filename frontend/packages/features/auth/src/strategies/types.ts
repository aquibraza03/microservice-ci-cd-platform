import type { AuthProviderType, LoginRequest, LoginResponse, Session, User } from "@saas/types";

export type StrategyName = AuthProviderType | "dev" | "guest";

/**
 * Authentication strategy contract.
 *
 * The provider is strategy-agnostic; each identity flow (JWT, refresh-token,
 * OAuth2, OIDC, GitHub, Google, Microsoft Entra, Keycloak, Okta, Auth0) is a
 * strategy implementing this interface. Endpoints come from configuration.
 */
export interface AuthStrategy {
  readonly name: StrategyName;

  /** Restore a session from persisted state (returns null when signed out). */
  initialize(): Promise<Session | null>;

  /** Authenticate a user and persist the resulting tokens. */
  login(request: LoginRequest): Promise<LoginResponse>;

  /** End the session. */
  logout(): Promise<void>;

  /** Exchange the current refresh token for a fresh token bundle. */
  refresh(): Promise<void>;

  /** Resolve the current user profile. */
  getMe(): Promise<User>;
}
