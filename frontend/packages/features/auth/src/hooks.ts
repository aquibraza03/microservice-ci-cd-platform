"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthStatus } from "@saas/types";
import { AUTH_REDIRECT_PARAM } from "./constants";
import { useAuth } from "./context";

/**
 * Authorization hooks.
 *
 * Full RBAC is NOT implemented yet; these prepare the permission model.
 * `permissions: ["*"]` denotes full access (wildcard).
 */

/** Whether the current user holds a permission (undefined permission is always granted). */
export function usePermission(permission?: string): boolean {
  const { user } = useAuth();
  if (permission === undefined) return true;
  const permissions = user?.permissions ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

/** Whether the current user holds a role. */
export function useHasRole(role: string): boolean {
  const { user } = useAuth();
  return user?.roles.includes(role) ?? false;
}

/** Whether the current user has any of the given roles. */
export function useHasAnyRole(roles: string[]): boolean {
  const { user } = useAuth();
  const userRoles = user?.roles ?? [];
  return roles.some((role) => userRoles.includes(role));
}

/**
 * Client-side route guard: redirects unauthenticated users to /login while
 * preserving the original destination in the `next` query parameter.
 */
export function useRequireAuth(): void {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === AuthStatus.LOADING || status === AuthStatus.IDLE) return;
    if (status !== AuthStatus.AUTHENTICATED) {
      const current = `${window.location.pathname}${window.location.search}`;
      const destination = encodeURIComponent(current);
      router.replace(`/login?${AUTH_REDIRECT_PARAM}=${destination}`);
    }
  }, [status, router]);
}
