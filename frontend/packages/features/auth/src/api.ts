"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getConfig } from "@saas/lib";
import type { AuthService } from "@saas/services";
import type { User } from "@saas/types";
import { AUTH_REDIRECT_PARAM } from "./constants";
import { useAuth } from "./context";

export const authKeys = {
  all: ["auth"] as const,
  user: () => [...authKeys.all, "user"] as const
};

export type AuthQueryDeps = {
  authService: AuthService;
};

/**
 * TanStack Query hooks for server auth state.
 * The mutation hooks drive the provider; query hooks cache identity lookups.
 */

export function useLoginMutation() {
  const { login } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: login,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.user() });
      const params = new URLSearchParams(window.location.search);
      const next = params.get(AUTH_REDIRECT_PARAM) ?? getConfig().auth.redirectPath;
      router.replace(next);
    }
  });
}

export function useLogoutMutation() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    }
  });
}

export function useCurrentUser(deps: AuthQueryDeps) {
  const { isAuthenticated } = useAuth();

  return useQuery<User>({
    queryKey: authKeys.user(),
    queryFn: () => deps.authService.getMe(),
    enabled: isAuthenticated,
    retry: 1,
    staleTime: 60_000
  });
}
