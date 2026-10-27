import type { AppConfig } from "@saas/lib";
import type { AuthService } from "@saas/services";
import type { TokenManager } from "../token-manager";
import { DevAuthStrategy } from "./dev.strategy";
import { GuestAuthStrategy } from "./guest.strategy";
import { JwtAuthStrategy } from "./jwt.strategy";
import type { AuthStrategy } from "./types";

export type StrategyDeps = {
  config: AppConfig;
  authService: AuthService;
  tokenManager: TokenManager;
};

/**
 * Strategy factory — maps configuration to the concrete authentication
 * strategy. Add new identity providers here (OAuth2, OIDC, Keycloak, Okta,
 * Auth0, Entra ID, GitHub, Google) without touching the provider.
 */
export function createStrategy(deps: StrategyDeps): AuthStrategy {
  const { config, tokenManager } = deps;

  // Validate injected configuration too, before a strategy can create a session.
  if (
    process.env.NODE_ENV === "production" &&
    (!config.auth.enabled || !["jwt", "refresh-token"].includes(config.auth.provider))
  ) {
    throw new Error(
      "Production authentication requires enabled jwt or refresh-token authentication."
    );
  }

  // Guest / anonymous mode.
  if (!config.auth.enabled || config.auth.provider === "guest") {
    return new GuestAuthStrategy(tokenManager);
  }

  // Development-only mock strategy (never active in production).
  if (config.auth.provider === "dev") {
    return new DevAuthStrategy(tokenManager);
  }

  // Default production strategy: JWT + refresh tokens.
  if (config.auth.provider === "jwt" || config.auth.provider === "refresh-token") {
    return new JwtAuthStrategy(deps.authService, tokenManager);
  }

  // Future OAuth/OIDC providers resolve here.
  return new JwtAuthStrategy(deps.authService, tokenManager);
}

export type { AuthStrategy, StrategyName } from "./types";
