/**
 * Central site metadata.
 * Single source of truth for branding/SEO constants used across the application.
 */

export const site = {
  name: "Enterprise SaaS Platform",
  shortName: "SaaS Platform",
  description:
    "Enterprise SaaS control plane for service management, observability, and platform operations.",
  url: "https://saas.example.com",
  ogImage: "/images/og.png",
  locale: "en_US",
  defaultTitle: "Enterprise SaaS Platform",
  themeColor: { light: "#ffffff", dark: "#0a0a0b" }
} as const;

export const appStatus = {
  online: "online",
  maintenance: "maintenance",
  offline: "offline"
} as const;

export type AppStatus = (typeof appStatus)[keyof typeof appStatus];
