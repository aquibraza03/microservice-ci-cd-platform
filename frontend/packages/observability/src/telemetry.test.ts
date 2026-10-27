import { describe, expect, it, vi } from "vitest";
import { getTelemetry, NoopTelemetryProvider, resetTelemetry, setTelemetryProvider } from "./index";
import type { TelemetryProvider } from "./types";

describe("telemetry registry", () => {
  it("defaults to the no-op provider", () => {
    expect(getTelemetry()).toBeInstanceOf(NoopTelemetryProvider);
  });

  it("never throws for any extension point", () => {
    const telemetry = getTelemetry();
    expect(() => {
      telemetry.captureException(new Error("boom"));
      telemetry.captureMessage("hello", "info", { a: 1 });
      telemetry.trackEvent({ name: "registry.open", properties: { id: "1" } });
      telemetry.setUser({ id: "u1", roles: ["admin"] });
      const span = telemetry.startSpan("registry.list");
      span.end({ ok: true });
    }).not.toThrow();
  });

  it("routes calls to a registered provider", () => {
    const provider: TelemetryProvider = {
      name: "test",
      captureException: vi.fn(),
      captureMessage: vi.fn(),
      trackEvent: vi.fn(),
      setUser: vi.fn(),
      startSpan: vi.fn(() => ({ end: vi.fn() }))
    };
    setTelemetryProvider(provider);

    getTelemetry().captureException(new Error("x"));
    expect(provider.captureException).toHaveBeenCalledOnce();

    resetTelemetry();
    expect(getTelemetry()).toBeInstanceOf(NoopTelemetryProvider);
  });
});
