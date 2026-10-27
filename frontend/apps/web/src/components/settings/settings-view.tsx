"use client";

import { useState } from "react";
import { Bell, Code2, LockKeyhole, Palette, UserRound } from "lucide-react";
import { useLocalStorage } from "@saas/hooks";
import { useAuth } from "@saas/features/auth";
import { useAppTheme } from "@saas/features/theme";
import { useI18n } from "@saas/intl";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  PageHeader
} from "@saas/ui";
import { cn } from "@saas/utils";

const sections = [
  ["profile", UserRound],
  ["preferences", Code2],
  ["appearance", Palette],
  ["notifications", Bell],
  ["security", LockKeyhole],
  ["developer", Code2]
] as const;

export function SettingsView() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { theme, setTheme } = useAppTheme();
  const [active, setActive] = useState<(typeof sections)[number][0]>("profile");
  const [compactMode, setCompactMode] = useLocalStorage("settings.compact-mode", false);
  const [emailNotifications, setEmailNotifications] = useLocalStorage(
    "settings.email-notifications",
    true
  );

  const title = t(`settings.sections.${active}` as never);
  const description = t(`settings.sections.${active}.description` as never);

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label={t("settings.navigation")} className="space-y-1">
          {sections.map(([id, Icon]) => (
            <Button
              key={id}
              variant="ghost"
              className={cn("w-full justify-start gap-3", active === id && "bg-accent")}
              onClick={() => setActive(id)}
              aria-current={active === id ? "page" : undefined}
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(`settings.sections.${id}` as never)}
            </Button>
          ))}
        </nav>

        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {active === "profile" ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">{t("settings.email")}</dt>
                  <dd className="mt-1 font-medium">{user?.email ?? t("common.unavailable")}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">{t("settings.name")}</dt>
                  <dd className="mt-1 font-medium">{user?.name ?? t("common.unavailable")}</dd>
                </div>
              </dl>
            ) : null}
            {active === "appearance" ? (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">{t("settings.theme")}</legend>
                <div className="flex flex-wrap gap-2">
                  {(["light", "dark", "system"] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant={theme === mode ? "default" : "outline"}
                      onClick={() => setTheme(mode)}
                      aria-pressed={theme === mode}
                    >
                      {t(`settings.theme.${mode}` as never)}
                    </Button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {active === "preferences" ? (
              <label className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={compactMode}
                  onChange={(event) => setCompactMode(event.target.checked)}
                />
                {t("settings.compactMode")}
              </label>
            ) : null}
            {active === "notifications" ? (
              <label className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={emailNotifications}
                  onChange={(event) => setEmailNotifications(event.target.checked)}
                />
                {t("settings.emailNotifications")}
              </label>
            ) : null}
            {active === "security" || active === "developer" ? (
              <p className="text-sm text-muted-foreground">{t("settings.unavailable")}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
