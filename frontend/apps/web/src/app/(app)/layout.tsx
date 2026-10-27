"use client";

import type { ReactNode } from "react";
import { RequireAuth } from "@saas/features/auth";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Authenticated application layout. Every page under the `(app)` route group
 * is wrapped in the shell and gated behind `RequireAuth` (redirects to /login
 * when unauthenticated).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
