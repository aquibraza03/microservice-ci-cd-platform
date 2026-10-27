import type { DashboardTimeRange } from "@saas/types";

export const DASHBOARD_TIME_RANGES: readonly DashboardTimeRange[] = [
  "24h",
  "7d",
  "30d",
  "90d"
] as const;

export const DASHBOARD_DATA_SOURCE = {
  HTTP: "http",
  DEV: "dev"
} as const;

export type DashboardDataSourceName =
  (typeof DASHBOARD_DATA_SOURCE)[keyof typeof DASHBOARD_DATA_SOURCE];

/** Default number of rows requested by dashboard widgets. */
export const DASHBOARD_DEFAULT_LIMIT = 8;
