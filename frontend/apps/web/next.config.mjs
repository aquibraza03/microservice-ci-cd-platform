/**
 * Next.js configuration for the web application.
 *
 * - `allowedDevOrigins` enables preview access from `*.monkeycode-ai.live`.
 * - `transpilePackages` is required because the workspace packages ship
 *   TypeScript sources directly (monorepo convention).
 * - `headers` apply baseline security headers and a Content-Security-Policy
 *   foundation. CSP hardening path (nonce-based script-src, strict
 *   connect-src, Trusted Types) is documented in the security report.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [".monkeycode-ai.live"],
  transpilePackages: [
    "@saas/config",
    "@saas/features",
    "@saas/hooks",
    "@saas/intl",
    "@saas/lib",
    "@saas/observability",
    "@saas/services",
    "@saas/types",
    "@saas/ui",
    "@saas/utils"
  ],
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";

    // Next streams inline bootstrap/hydration scripts and Tailwind injects
    // inline styles, so a script/style nonce is required for a strict CSP.
    // Until nonces are wired, scripts allow 'unsafe-inline'; 'unsafe-eval' is
    // additionally required by the development server only.
    const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()"
          },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src ${scriptSrc}`,
              // Inline styles are required for Tailwind/hydrated class injection.
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              // API origins are environment-driven (NEXT_PUBLIC_API_BASE_URL),
              // so connect-src is intentionally permissive in the foundation.
              "connect-src 'self' http: https: ws: wss:",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'"
            ].join("; ")
          }
        ]
      }
    ];
  }
};

export default nextConfig;
