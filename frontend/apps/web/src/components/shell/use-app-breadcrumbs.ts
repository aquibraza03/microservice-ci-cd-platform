"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "@saas/intl";
import { useProject } from "@saas/features/dashboard";
import { capitalize } from "@saas/utils";
import type { BreadcrumbItem } from "@saas/ui";
import { getAppComposition } from "@/lib/composition";
import { navItems } from "./nav-items";

/**
 * Derive the header breadcrumb trail from the current pathname using the
 * navigation model as the source of truth. Dynamic segments (e.g. a project
 * id) are resolved against the data source when known.
 */
export function useAppBreadcrumbs(): BreadcrumbItem[] {
  const pathname = usePathname();
  const { t } = useI18n();
  const { dashboard } = getAppComposition();

  const segments = pathname.split("/").filter(Boolean);
  const item = navItems.find(
    (candidate) => pathname === candidate.href || pathname.startsWith(`${candidate.href}/`)
  );
  const trailing =
    item && item.href !== pathname
      ? pathname.slice(item.href.length).split("/").filter(Boolean)
      : [];
  const projectId = item?.href === "/projects" && trailing.length === 1 ? trailing[0] : null;

  // Hook rules: called unconditionally; enabled only when a project id is present.
  const projectQuery = useProject(projectId ?? "", { source: dashboard });

  if (segments.length === 0) return [];

  const items: BreadcrumbItem[] = [];
  if (item) {
    items.push({
      label: t(item.labelKey),
      href: item.href === pathname ? undefined : item.href
    });
    if (projectId) {
      items.push({ label: projectQuery.data?.name ?? projectId, current: true });
    } else {
      for (const segment of trailing) {
        items.push({ label: capitalize(segment), current: true });
      }
    }
  } else {
    items.push({ label: capitalize(segments[0] ?? ""), current: true });
  }

  return items;
}
