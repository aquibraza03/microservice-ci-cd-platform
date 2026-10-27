import { z } from "zod";
import type { AppConfig } from "@saas/lib";
import type { HttpClient } from "../http";
import { resolveUrl } from "../url";
import {
  LoginResponseSchema,
  UserSchema,
  type LoginRequest,
  type LoginResponse,
  type TokenBundle,
  type User
} from "@saas/types";

/**
 * Token refresh payload contract. The backend is expected to return a fresh
 * access token (and optionally a new refresh token / lifetime).
 */
export const RefreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional().nullable(),
  idToken: z.string().optional().nullable(),
  expiresIn: z.number().int().positive().optional()
});

export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

/**
 * Typed authentication service bound to the configured auth endpoints.
 *
 * NOTE: the current backend `auth-service` is a development stub (GET /login
 * returns a static message only). These methods model the production contract
 * for the endpoints in `NEXT_PUBLIC_AUTH_*` configuration. Strategies decide
 * which endpoints are actually exercised; the API layer never invents
 * behavior the backend does not provide.
 */
export interface AuthService {
  /** Exchange credentials for a session. */
  login(request: LoginRequest): Promise<LoginResponse>;
  /** Invalidate the session server-side. */
  logout(): Promise<void>;
  /** Exchange a refresh token for a fresh token bundle. */
  refresh(refreshToken: string): Promise<RefreshResponse>;
  /** Resolve the current user from the identity endpoint. */
  getMe(): Promise<User>;
}

export function createAuthService(http: HttpClient, config: AppConfig): AuthService {
  const endpoints = config.auth.endpoints;

  return {
    login: (request) =>
      http.post<LoginResponse>(resolveUrl(config.api.baseUrl, endpoints.login), request, {
        schema: LoginResponseSchema
      }),

    logout: async () => {
      await http.post<void>(resolveUrl(config.api.baseUrl, endpoints.logout));
    },

    refresh: (refreshToken: string) =>
      http.post<RefreshResponse>(resolveUrl(config.api.baseUrl, endpoints.refresh), {
        refreshToken
      }),

    getMe: () =>
      http.get<User>(resolveUrl(config.api.baseUrl, endpoints.userinfo), { schema: UserSchema })
  };
}

/** Build a token bundle from a refresh response. */
export function tokensFromRefresh(refresh: RefreshResponse, previous?: TokenBundle): TokenBundle {
  const expiresAt = refresh.expiresIn
    ? Date.now() + refresh.expiresIn * 1000
    : (previous?.expiresAt ?? null);

  return {
    accessToken: refresh.accessToken,
    refreshToken: refresh.refreshToken ?? previous?.refreshToken ?? null,
    idToken: refresh.idToken ?? previous?.idToken ?? null,
    expiresAt
  };
}
