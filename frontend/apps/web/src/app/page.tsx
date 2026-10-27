import Link from "next/link";
import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { Boxes, ChartNoAxesCombined, GitBranch, ShieldCheck } from "lucide-react";
import { site } from "@saas/config";
import { getConfig } from "@saas/lib";
import { t } from "@saas/intl";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@saas/ui";

export const metadata: Metadata = {
  title: site.defaultTitle
};

type Feature = {
  icon: LucideIcon;
  titleKey: Parameters<typeof t>[0];
  descriptionKey: Parameters<typeof t>[0];
  flag: "registry" | "observability" | "ciCd" | null;
};

const features: Feature[] = [
  {
    icon: Boxes,
    titleKey: "landing.feature.registry.title",
    descriptionKey: "landing.feature.registry.description",
    flag: "registry"
  },
  {
    icon: ChartNoAxesCombined,
    titleKey: "landing.feature.observability.title",
    descriptionKey: "landing.feature.observability.description",
    flag: "observability"
  },
  {
    icon: GitBranch,
    titleKey: "landing.feature.ciCd.title",
    descriptionKey: "landing.feature.ciCd.description",
    flag: "ciCd"
  },
  {
    icon: ShieldCheck,
    titleKey: "landing.feature.security.title",
    descriptionKey: "landing.feature.security.description",
    flag: null
  }
];

export default function HomePage() {
  const config = getConfig();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
            {config.name}
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">{t("landing.signIn")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">{t("landing.getStarted")}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-20 text-center">
          <Badge variant="info" className="mb-6">
            {t("landing.controlPlane")}
          </Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            {t("landing.hero")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
            {site.description}
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">{t("landing.openDashboard")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">{t("landing.exploreFeatures")}</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20">
          <h2 className="sr-only">{t("landing.platformCapabilities")}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, titleKey, descriptionKey, flag }) => {
              const enabled = flag === null || config.features[flag];
              return (
                <Card key={titleKey} className={enabled ? "" : "opacity-60"}>
                  <CardHeader>
                    <Icon className="size-6 text-primary" aria-hidden="true" />
                    <CardTitle className="mt-3">{t(titleKey)}</CardTitle>
                    <CardDescription>{t(descriptionKey)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Badge variant={enabled ? "success" : "secondary"}>
                      {enabled ? t("common.available") : t("common.planned")}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 text-sm text-muted-foreground sm:flex-row">
          <p>{t("landing.copyright", { year: new Date().getFullYear(), name: config.name })}</p>
          <p>{t("landing.environment", { environment: process.env.NODE_ENV })}</p>
        </div>
      </footer>
    </div>
  );
}
