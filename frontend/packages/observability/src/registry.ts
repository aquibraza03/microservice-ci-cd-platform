import { NoopTelemetryProvider } from "./noop";
import type { TelemetryProvider } from "./types";

/**
 * Telemetry registry.
 * The app calls `getTelemetry()`; vendors register via `setTelemetryProvider()`.
 * No provider is wired in the foundation — the no-op keeps everything safe.
 */
let provider: TelemetryProvider = new NoopTelemetryProvider();

/** Register a concrete observability provider (idempotent, last wins). */
export function setTelemetryProvider(next: TelemetryProvider): void {
  provider = next;
}

/** The active telemetry provider (never null). */
export function getTelemetry(): TelemetryProvider {
  return provider;
}

/** Restore the no-op provider (used by tests). */
export function resetTelemetry(): void {
  provider = new NoopTelemetryProvider();
}
