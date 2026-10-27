import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "@saas/lib";
import type { AuthService } from "@saas/services";
import { MemoryTokenPersistence } from "../persistence";
import { TokenManager } from "../token-manager";
import { createStrategy } from "./index";
import { GuestAuthStrategy } from "./guest.strategy";
import { DevAuthStrategy } from "./dev.strategy";

function dependencies(provider: string, enabled = true) {
  const base = getConfig();
  const authService = {
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    getMe: vi.fn()
  } satisfies AuthService;
  return {
    config: { ...base, auth: { ...base.auth, provider, enabled } },
    authService,
    tokenManager: new TokenManager(new MemoryTokenPersistence())
  };
}

describe("production authentication boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["guest", "dev", "unknown-provider"])(
    "rejects injected production %s config before auth calls",
    (provider) => {
      const deps = dependencies(provider);
      vi.stubEnv("NODE_ENV", "production");
      expect(() => createStrategy(deps)).toThrow(/production authentication/i);
      for (const fn of Object.values(deps.authService)) expect(fn).not.toHaveBeenCalled();
      expect(deps.tokenManager.getAccessToken()).toBeNull();
    }
  );

  it("rejects disabled authentication even with a supported provider", () => {
    const deps = dependencies("jwt", false);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createStrategy(deps)).toThrow(/production authentication/i);
  });

  it("rejects direct guest and dev construction in production", () => {
    const { tokenManager } = dependencies("jwt");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => new GuestAuthStrategy(tokenManager)).toThrow(/production/i);
    expect(() => new DevAuthStrategy(tokenManager)).toThrow(/production/i);
  });

  it.each(["jwt", "refresh-token"])(
    "supports %s without inventing an authenticated session",
    async (provider) => {
      const deps = dependencies(provider);
      vi.stubEnv("NODE_ENV", "production");
      const strategy = createStrategy(deps);
      expect(strategy.name).toBe("jwt");
      expect(await strategy.initialize()).toBeNull();
      expect(deps.authService.getMe).not.toHaveBeenCalled();
    }
  );

  it.each(["development", "test"])("preserves dev and guest selection in %s", (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    expect(createStrategy(dependencies("dev")).name).toBe("dev");
    expect(createStrategy(dependencies("guest")).name).toBe("guest");
    expect(createStrategy(dependencies("jwt", false)).name).toBe("guest");
  });
});
