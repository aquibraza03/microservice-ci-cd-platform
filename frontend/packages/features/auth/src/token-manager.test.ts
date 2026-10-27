import { describe, expect, it, vi } from "vitest";
import { TokenManager } from "./token-manager";
import type { TokenPersistence } from "./persistence";
import type { TokenBundle } from "@saas/types";

function stubPersistence(initial: TokenBundle | null = null): TokenPersistence {
  let stored = initial;
  return {
    read: () => (stored === null ? { accessToken: null, refreshToken: null } : { ...stored }),
    write: (tokens) => {
      stored = { ...tokens };
    },
    clear: () => {
      stored = null;
    }
  };
}

const bundle: TokenBundle = {
  accessToken: "a.b.c",
  refreshToken: "r.1",
  expiresAt: null
};

describe("TokenManager", () => {
  it("restores tokens from persistence", () => {
    const manager = new TokenManager(stubPersistence(bundle));
    expect(manager.restore()).toEqual(bundle);
  });

  it("setTokens persists and getTokens returns a copy", () => {
    const persistence = stubPersistence();
    const manager = new TokenManager(persistence);
    manager.setTokens(bundle);

    const tokens = manager.getTokens();
    tokens.accessToken = "mutated";

    expect(manager.getTokens().accessToken).toBe("a.b.c");
    expect(persistence.read()?.accessToken).toBe("a.b.c");
  });

  it("clear wipes tokens from memory and persistence", () => {
    const persistence = stubPersistence(bundle);
    const manager = new TokenManager(persistence);
    manager.restore();
    manager.clear();

    expect(manager.getAccessToken()).toBeNull();
    expect(manager.getRefreshToken()).toBeNull();
    expect(persistence.read()?.accessToken).toBeNull();
  });

  it("reports expiry only when an expiry is known", () => {
    const manager = new TokenManager(stubPersistence());

    manager.setTokens({ accessToken: "t", refreshToken: null, expiresAt: null });
    expect(manager.accessTokenExpired()).toBe(false);

    manager.setTokens({ accessToken: "t", refreshToken: null, expiresAt: Date.now() - 1000 });
    expect(manager.accessTokenExpired()).toBe(true);

    manager.setTokens({ accessToken: "t", refreshToken: null, expiresAt: Date.now() + 60_000 });
    expect(manager.accessTokenExpired()).toBe(false);
  });

  it("invokes the injected refresh task and notifies on failure", async () => {
    const onSessionExpired = vi.fn();
    const manager = new TokenManager(stubPersistence(), onSessionExpired);
    const refreshTask = vi.fn().mockResolvedValue(undefined);
    manager.setRefreshTask(refreshTask);

    await manager.refresh();
    expect(refreshTask).toHaveBeenCalledOnce();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("throws and notifies when the refresh task fails", async () => {
    const onSessionExpired = vi.fn();
    const manager = new TokenManager(stubPersistence(), onSessionExpired);
    manager.setRefreshTask(() => Promise.reject(new Error("network down")));

    await expect(manager.refresh()).rejects.toThrow("network down");
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("throws when refresh is invoked before a task is configured", async () => {
    const manager = new TokenManager(stubPersistence());
    await expect(manager.refresh()).rejects.toThrow("not configured");
  });
});
