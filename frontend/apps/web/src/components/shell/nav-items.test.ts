import { describe, expect, it } from "vitest";
import type { AppConfig } from "@saas/lib";
import type { User } from "@saas/types";
import { navGroups, navItems } from "./nav-items";
import { canViewItem, getVisibleNavGroups } from "./nav-visibility";

function configWith(features: Partial<AppConfig["features"]>): AppConfig {
  return { features: { ...EMPTY_FEATURES, ...features } } as unknown as AppConfig;
}

const EMPTY_FEATURES = {
  registry: false,
  observability: false,
  ciCd: false,
  pipelines: false,
  deployments: false,
  repositories: false,
  environments: false,
  containers: false,
  infrastructure: false,
  logs: false,
  traces: false,
  alerts: false,
  security: false,
  vulnerabilities: false,
  sbom: false,
  compliance: false,
  users: false,
  teams: false,
  settings: false
};

const FULL_USER: User = { id: "u1", permissions: ["*"], roles: [] };

describe("navigation model", () => {
  it("prepares the four required groups", () => {
    expect(navGroups.map((group) => group.id)).toEqual([
      "platform",
      "observability",
      "security",
      "management"
    ]);
  });

  it("covers the required sections and routes", () => {
    const hrefs = navItems.map((item) => item.href);
    for (const href of [
      "/dashboard",
      "/projects",
      "/pipelines",
      "/pipeline-runs",
      "/deployments",
      "/environments",
      "/docker",
      "/kubernetes",
      "/terraform",
      "/logs",
      "/observability",
      "/security",
      "/security/vulnerabilities",
      "/settings"
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("keeps hrefs unique", () => {
    const hrefs = navItems.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("hides flag-gated items until their flag is enabled", () => {
    const visible = getVisibleNavGroups(configWith({}), FULL_USER).flatMap((group) => group.items);
    expect(visible.some((item) => item.href === "/pipeline-runs")).toBe(false);
    expect(visible.some((item) => item.href === "/security")).toBe(false);

    const enabled = getVisibleNavGroups(
      configWith({ pipelines: true, security: true }),
      FULL_USER
    ).flatMap((group) => group.items);
    expect(enabled.some((item) => item.href === "/pipeline-runs")).toBe(true);
    expect(enabled.some((item) => item.href === "/security")).toBe(true);
  });

  it("respects permissions for visibility", () => {
    const item = navItems.find((candidate) => candidate.href === "/deployments")!;
    expect(item.permission).toBeTruthy();
    expect(
      canViewItem(item, configWith({ deployments: true }), { id: "u", permissions: [], roles: [] })
    ).toBe(false);
    expect(
      canViewItem(item, configWith({ deployments: true }), {
        id: "u",
        permissions: ["deployments:read"],
        roles: []
      })
    ).toBe(true);
    expect(canViewItem(item, configWith({ deployments: true }), FULL_USER)).toBe(true);
  });

  it("keeps dashboard and projects always visible", () => {
    const visible = getVisibleNavGroups(configWith({}), FULL_USER).flatMap((group) => group.items);
    expect(visible.some((item) => item.href === "/dashboard")).toBe(true);
    expect(visible.some((item) => item.href === "/projects")).toBe(true);
  });
});
