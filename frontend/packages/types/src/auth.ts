import { z } from "zod";

/**
 * Identity provider strategies supported by the authentication layer.
 * The architecture prepares for these; wiring is configuration-driven.
 */
export const AuthProviderType = {
  JWT: "jwt",
  REFRESH_TOKEN: "refresh-token",
  OAUTH2: "oauth2",
  OIDC: "oidc",
  GITHUB: "github",
  GOOGLE: "google",
  ENTRA_ID: "microsoft-entra-id",
  KEYCLOAK: "keycloak",
  OKTA: "okta",
  AUTH0: "auth0"
} as const;

export type AuthProviderType = (typeof AuthProviderType)[keyof typeof AuthProviderType];

export const AuthStatus = {
  IDLE: "idle",
  LOADING: "loading",
  AUTHENTICATED: "authenticated",
  UNAUTHENTICATED: "unauthenticated",
  EXPIRED: "expired"
} as const;

export type AuthStatus = (typeof AuthStatus)[keyof typeof AuthStatus];

/** Authenticated principal. */
export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().optional().nullable(),
  name: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  roles: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  picture: z.string().url().optional().nullable(),
  provider: z.string().optional().nullable(),
  locale: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type User = z.infer<typeof UserSchema>;

/** Session exposed by the auth provider. */
export type Session = {
  user: User | null;
  tokens: TokenBundle;
  status: AuthStatus;
  error: Error | null;
};

/** Request used to initiate a session. */
export type LoginRequest = {
  email: string;
  password?: string;
  provider?: AuthProviderType;
  code?: string;
  redirectUri?: string;
};

export const TokenBundleSchema = z.object({
  accessToken: z.string().nullable(),
  refreshToken: z.string().nullable(),
  idToken: z.string().nullable().optional(),
  expiresAt: z.number().nullable().optional()
});

export type TokenBundle = z.infer<typeof TokenBundleSchema>;

export const LoginResponseSchema = z.object({
  user: UserSchema,
  tokens: TokenBundleSchema
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export type AuthResult = LoginResponse;
