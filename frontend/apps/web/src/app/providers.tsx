"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@saas/features/auth";
import { ThemeProvider } from "@saas/features/theme";
import { IntlBootstrap } from "@/components/intl/intl-bootstrap";
import { getAppComposition } from "@/lib/composition";

/**
 * Application composition root.
 *
 * Builds the dependency container once (services, token manager, config) and
 * injects it into the providers. All cross-cutting concerns (theme, server
 * state, session, locale) are owned here; pages never build infrastructure.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  const composition = getAppComposition();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider
          config={composition.config}
          authService={composition.services.auth}
          tokenManager={composition.tokenManager}
        >
          <IntlBootstrap />
          {children}
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
