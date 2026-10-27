import type {
  Span,
  TelemetryEvent,
  TelemetryLevel,
  TelemetryProvider,
  TelemetryUser
} from "./types";

const noopSpan: Span = {
  end: () => {}
};

/**
 * Default telemetry provider: a no-op that guarantees the application never
 * crashes when no observability vendor is registered. Real providers implement
 * `TelemetryProvider` and are registered via `setTelemetryProvider`.
 */
export class NoopTelemetryProvider implements TelemetryProvider {
  readonly name = "noop";

  captureException(_error: unknown, _context?: Record<string, unknown>): void {}

  captureMessage(
    _message: string,
    _level?: TelemetryLevel,
    _context?: Record<string, unknown>
  ): void {}

  trackEvent(_event: TelemetryEvent): void {}

  setUser(_user: TelemetryUser | null): void {}

  startSpan(_name: string, _attributes?: Record<string, unknown>): Span {
    return noopSpan;
  }

  async flush(): Promise<void> {}
}
