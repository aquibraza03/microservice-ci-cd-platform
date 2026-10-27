"use client";

import type { AppConfig } from "@saas/lib";
import type { User } from "@saas/types";
import { navGroups, type NavGroup, type NavItem } from "./nav-items";

/**
 * Pure visibility filter for the navigation model. An item is visible when its
 * feature flag is enabled and (when configured) the user holds the required
 * permission. Kept hook-free so the sidebar, breadcrumbs, and command palette
 * share one source of truth.
 */
export function canViewItem(item: NavItem, config: AppConfig, user: User | null): boolean {
  if (item.flag !== undefined && item.flag !== null && !config.features[item.flag]) {
    return false;
  }
  if (item.permission === null || item.permission === undefined) return true;
  const permissions = user?.permissions ?? [];
  return permissions.includes("*") || permissions.includes(item.permission);
}

/** Groups filtered to visible items (empty groups are dropped). */
export function getVisibleNavGroups(config: AppConfig, user: User | null): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canViewItem(item, config, user))
    }))
    .filter((group) => group.items.length > 0);
}
