"use client";

import type { ReactNode } from "react";
import { AuthStatus } from "@saas/types";
import { Skeleton } from "@saas/ui";
import { useAuth } from "./context";
import { useRequireAuth } from "./hooks";

export type RequireAuthProps = {
  children: ReactNode;
  /** Custom loading fallback rendered while the session restores. */
  loadingFallback?: ReactNode;
};

/**
 * Declarative route guard for client components.
 * - While restoring the session → loading fallback (skeleton).
 * - Unauthenticated → redirect to /login (handled by `useRequireAuth`).
 * - Authenticated → renders children.
 */
export function RequireAuth({ children, loadingFallback }: RequireAuthProps) {
  const { status } = useAuth();
  useRequireAuth();

  if (status === AuthStatus.LOADING || status === AuthStatus.IDLE) {
    return loadingFallback ?? <AuthLoadingSkeleton />;
  }

  if (status !== AuthStatus.AUTHENTICATED) {
    return null;
  }

  return children;
}

function AuthLoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col gap-6 p-8" aria-busy="true" role="status">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
