import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { site } from "@saas/config";
import { getConfig, serializePublicEnv } from "@saas/lib";
import { Providers } from "./providers";
import "./globals.css";

const config = getConfig();

export const metadata: Metadata = {
  metadataBase: new URL(config.url),
  title: {
    default: site.defaultTitle,
    template: `%s | ${site.shortName}`
  },
  description: site.description,
  applicationName: site.shortName,
  keywords: ["enterprise", "saas", "platform", "control plane", "observability"],
  openGraph: {
    title: site.defaultTitle,
    description: site.description,
    url: config.url,
    siteName: site.shortName,
    locale: site.locale,
    type: "website"
  },
  robots: {
    index: true,
    follow: true
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: site.themeColor.light },
    { media: "(prefers-color-scheme: dark)", color: site.themeColor.dark }
  ],
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans">
        <script
          id="public-env"
          dangerouslySetInnerHTML={{ __html: `window.__ENV__=${serializePublicEnv()};` }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
