"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@saas/ui";
import { useI18n } from "@saas/intl";
import { useAppTheme } from "../hooks";

export type ThemeToggleProps = {
  className?: string;
};

const ORDER = ["light", "dark", "system"] as const;

/**
 * Theme mode switcher: cycles light → dark → system.
 * A11y: real button with descriptive label; no layout shift (fixed size).
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useAppTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (theme ?? "system") as (typeof ORDER)[number];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  const label =
    current === "light"
      ? t("theme.toggle.light")
      : current === "dark"
        ? t("theme.toggle.dark")
        : t("theme.toggle.system");
  const fallback = t("theme.toggle.default");

  function cycle() {
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? "system";
    setTheme(next);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label={mounted ? label : fallback}
      title={mounted ? label : fallback}
      onClick={cycle}
    >
      {mounted ? <Icon aria-hidden="true" /> : <Sun aria-hidden="true" />}
    </Button>
  );
}
