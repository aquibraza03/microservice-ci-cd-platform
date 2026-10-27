import { getConfig } from "./config";

/**
 * Lightweight structured logger.
 *
 * Level-gated via `NEXT_PUBLIC_LOG_LEVEL`. In production the default level is
 * `info`; set to `silent` to fully disable. All logs are emitted to the
 * browser/server console and can be replaced with a SaaS logging sink later
 * without changing call sites.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100
};

let cachedLevel: LogLevel | null = null;

function effectiveLevel(): LogLevel {
  if (cachedLevel === null) {
    try {
      cachedLevel = getConfig().logLevel;
    } catch {
      cachedLevel = "info";
    }
  }
  return cachedLevel;
}

/** Allow tests to override the level. */
export function setLogLevel(level: LogLevel): void {
  cachedLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[effectiveLevel()];
}

function log(level: Exclude<LogLevel, "silent">, message: string, meta?: unknown): void {
  if (!shouldLog(level)) return;

  const payload = meta === undefined ? "" : meta;

  // eslint-disable-next-line no-console
  const sink = console[level === "debug" ? "debug" : level] ?? console.log;
  if (typeof payload === "string") {
    sink(`[${level.toUpperCase()}] ${message} ${payload}`.trim());
  } else {
    sink(`[${level.toUpperCase()}] ${message}`, payload);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => log("debug", message, meta),
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta)
};
