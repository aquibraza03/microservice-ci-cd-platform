/**
 * Telemetry provider contract.
 *
 * This is the extension point for observability vendors (Sentry, Datadog,
 * OpenTelemetry, PostHog, Amplitude, …). The application only depends on this
 * interface; concrete providers are registered at runtime and can be swapped
 * without touching call sites.
 */

export type TelemetryLevel = "debug" | "info" | "warn" | "error";

export type TelemetryUser = {
  id: string;
  email?: string | null;
  roles?: string[];
};

export type TelemetryEvent = {
  name: string;
  properties?: Record<string, unknown>;
};

export interface Span {
  end(attributes?: Record<string, unknown>): void;
}

export interface TelemetryProvider {
  readonly name: string;

  /** Report an uncaught exception / error boundary capture. */
  captureException(error: unknown, context?: Record<string, unknown>): void;

  /** Report a log-level message (frontend logging). */
  captureMessage(message: string, level?: TelemetryLevel, context?: Record<string, unknown>): void;

  /** Track a product/feature usage event (analytics). */
  trackEvent(event: TelemetryEvent): void;

  /** Bind an authenticated principal to subsequent telemetry. */
  setUser(user: TelemetryUser | null): void;

  /** Start a manual span (performance monitoring / tracing). */
  startSpan(name: string, attributes?: Record<string, unknown>): Span;

  /** Flush buffered events (optional). */
  flush?(): Promise<void>;
}
