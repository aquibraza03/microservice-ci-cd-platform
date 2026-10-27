import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "./env";

describe("production integration safety", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["guest", "dev", "unknown-provider"])("rejects production provider %s", (provider) => {
    expect(() => parseEnv({ NODE_ENV: "production", NEXT_PUBLIC_AUTH_PROVIDER: provider })).toThrow(
      /production authentication/i
    );
  });

  it.each(["false", "0"])("rejects disabled production auth (%s)", (enabled) => {
    expect(() => parseEnv({ NODE_ENV: "production", NEXT_PUBLIC_AUTH_ENABLED: enabled })).toThrow(
      /production authentication/i
    );
  });

  it.each(["jwt", "refresh-token"])("accepts supported production provider %s", (provider) => {
    expect(
      parseEnv({ NODE_ENV: "production", NEXT_PUBLIC_AUTH_PROVIDER: provider })
        .NEXT_PUBLIC_AUTH_PROVIDER
    ).toBe(provider);
  });

  it.each(["development", "test"])("preserves explicit dev and guest auth in %s", (environment) => {
    for (const provider of ["dev", "guest"]) {
      expect(
        parseEnv({ NODE_ENV: environment, NEXT_PUBLIC_AUTH_PROVIDER: provider })
          .NEXT_PUBLIC_AUTH_PROVIDER
      ).toBe(provider);
    }
    expect(
      parseEnv({ NODE_ENV: environment, NEXT_PUBLIC_AUTH_ENABLED: "false" })
        .NEXT_PUBLIC_AUTH_ENABLED
    ).toBe(false);
  });

  it("cannot downgrade the compiled production runtime through supplied environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => parseEnv({ NODE_ENV: "development", NEXT_PUBLIC_AUTH_PROVIDER: "guest" })).toThrow(
      /production authentication/i
    );
  });

  it("rejects development dashboard data in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production", NEXT_PUBLIC_DASHBOARD_SOURCE: "dev" })).toThrow(
      /development dashboard data is forbidden/i
    );
  });
});
