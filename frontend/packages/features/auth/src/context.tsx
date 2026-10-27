"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { AppConfig } from "@saas/lib";
import type { AuthService } from "@saas/services";
import { AuthStatus, type LoginRequest, type TokenBundle, type User } from "@saas/types";
import { AUTH_EVENTS } from "./constants";
import type { TokenManager } from "./token-manager";
import { createStrategy, type AuthStrategy } from "./strategies";

export type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  tokens: TokenBundle;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
  login: (request: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export type AuthProviderProps = {
  config: AppConfig;
  authService: AuthService;
  tokenManager: TokenManager;
  children: ReactNode;
};

/**
 * Authentication provider.
 *
 * Owns the session lifecycle: restore → authenticate → refresh → logout.
 * UI consumes `useAuth()`; nobody touches tokens or strategies directly.
 */
export function AuthProvider({ config, authService, tokenManager, children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>(AuthStatus.LOADING);
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<TokenBundle>({ accessToken: null, refreshToken: null });
  const [error, setError] = useState<Error | null>(null);

  // Strategy is created once per provider instance.
  const strategyRef = useRef<AuthStrategy | null>(null);
  if (strategyRef.current === null) {
    const strategy = createStrategy({ config, authService, tokenManager });
    tokenManager.setRefreshTask(() => strategy.refresh());
    strategyRef.current = strategy;
  }
  const strategy = strategyRef.current;

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const session = await strategy.initialize();
        if (cancelled) return;
        if (session === null) {
          setStatus(AuthStatus.UNAUTHENTICATED);
          setUser(null);
          setTokens({ accessToken: null, refreshToken: null });
        } else {
          setStatus(session.status);
          setUser(session.user);
          setTokens(session.tokens);
        }
      } catch (restoreError) {
        if (cancelled) return;
        setStatus(AuthStatus.UNAUTHENTICATED);
        setError(restoreError instanceof Error ? restoreError : new Error(String(restoreError)));
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [strategy]);

  // React to forced session expiry signaled by the API client.
  useEffect(() => {
    function handleExpired() {
      setUser(null);
      setTokens({ accessToken: null, refreshToken: null });
      setStatus(AuthStatus.UNAUTHENTICATED);
    }
    window.addEventListener(AUTH_EVENTS.SESSION_EXPIRED, handleExpired);
    return () => window.removeEventListener(AUTH_EVENTS.SESSION_EXPIRED, handleExpired);
  }, []);

  const login = useCallback(
    async (request: LoginRequest) => {
      setError(null);
      setStatus(AuthStatus.LOADING);
      try {
        const result = await strategy.login(request);
        setUser(result.user);
        setTokens(result.tokens);
        setStatus(AuthStatus.AUTHENTICATED);
      } catch (loginError) {
        setUser(null);
        setStatus(AuthStatus.UNAUTHENTICATED);
        const normalized = loginError instanceof Error ? loginError : new Error(String(loginError));
        setError(normalized);
        throw normalized;
      }
    },
    [strategy]
  );

  const logout = useCallback(async () => {
    setStatus(AuthStatus.LOADING);
    try {
      await strategy.logout();
    } finally {
      tokenManager.clear();
      setUser(null);
      setTokens({ accessToken: null, refreshToken: null });
      setStatus(AuthStatus.UNAUTHENTICATED);
    }
  }, [strategy, tokenManager]);

  const refresh = useCallback(async () => {
    await strategy.refresh();
    setTokens(tokenManager.getTokens());
  }, [strategy, tokenManager]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      tokens,
      isAuthenticated: status === AuthStatus.AUTHENTICATED,
      isLoading: status === AuthStatus.LOADING || status === AuthStatus.IDLE,
      error,
      login,
      logout,
      refresh
    }),
    [status, user, tokens, error, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the authentication context. Throws outside the provider. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
