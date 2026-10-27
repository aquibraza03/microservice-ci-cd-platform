import { beforeEach, describe, expect, it } from "vitest";
import { resetEnv } from "@saas/lib";
import { getAppComposition, resetAppComposition } from "./composition";

describe("getAppComposition", () => {
  beforeEach(() => {
    resetEnv();
    resetAppComposition();
  });

  it("assembles config, services, token manager, and dashboard source", () => {
    const composition = getAppComposition();

    expect(composition.config.api.baseUrl).toBeTruthy();
    expect(composition.services.auth).toBeDefined();
    expect(composition.services.health).toBeDefined();
    expect(composition.services.dashboard).toBeDefined();
    expect(composition.services.projects).toBeDefined();
    expect(composition.tokenManager).toBeDefined();
    expect(composition.dashboard).toBeDefined();
  });

  it("is a singleton across calls", () => {
    expect(getAppComposition()).toBe(getAppComposition());
  });

  it("resetAppComposition allows a fresh graph", () => {
    const first = getAppComposition();
    resetAppComposition();
    expect(getAppComposition()).not.toBe(first);
  });
});
