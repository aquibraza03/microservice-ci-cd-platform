import { describe, expect, it, vi } from "vitest";
import type { TokenBundle } from "@saas/types";
import {
  createTokenPersistence,
  LocalStorageTokenPersistence,
  MemoryTokenPersistence,
  type TokenPersistence
} from "./persistence";

const bundle: TokenBundle = {
  accessToken: "a.b.c",
  refreshToken: "r.1",
  expiresAt: null
};

describe("MemoryTokenPersistence", () => {
  it("returns a copy so callers cannot mutate internal state", () => {
    const persistence = new MemoryTokenPersistence();
    const read = persistence.read();
    read.accessToken = "mutated";
    expect(persistence.read().accessToken).toBeNull();
  });

  it("round-trips tokens and clears them", () => {
    const persistence = new MemoryTokenPersistence();
    persistence.write(bundle);
    expect(persistence.read()).toEqual(bundle);

    persistence.clear();
    expect(persistence.read()).toEqual({ accessToken: null, refreshToken: null });
  });

  it("never touches storage", () => {
    const getSpy = vi.fn();
    const setSpy = vi.fn();
    const removeSpy = vi.fn();

    vi.stubGlobal("localStorage", {
      getItem: getSpy,
      setItem: setSpy,
      removeItem: removeSpy
    } as unknown as Storage);

    const persistence = new MemoryTokenPersistence();
    persistence.write(bundle);
    persistence.read();
    persistence.clear();

    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("LocalStorageTokenPersistence", () => {
  it("is a dev-only convenience and still satisfies the boundary", () => {
    const persistence: TokenPersistence = new LocalStorageTokenPersistence();
    persistence.write(bundle);
    expect(persistence.read()).toEqual(bundle);
    persistence.clear();
  });
});

describe("createTokenPersistence", () => {
  it("selects localStorage for development providers only", () => {
    expect(createTokenPersistence("dev")).toBeInstanceOf(LocalStorageTokenPersistence);
    expect(createTokenPersistence("guest")).toBeInstanceOf(LocalStorageTokenPersistence);
  });

  it("selects memory persistence for production providers", () => {
    expect(createTokenPersistence("jwt")).toBeInstanceOf(MemoryTokenPersistence);
    expect(createTokenPersistence("refresh-token")).toBeInstanceOf(MemoryTokenPersistence);
    expect(createTokenPersistence("oauth2")).toBeInstanceOf(MemoryTokenPersistence);
    expect(createTokenPersistence("oidc")).toBeInstanceOf(MemoryTokenPersistence);
    expect(createTokenPersistence("keycloak")).toBeInstanceOf(MemoryTokenPersistence);
  });
});
