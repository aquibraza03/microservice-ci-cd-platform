"use client";
import { cn } from "@saas/utils";

export type SparklineProps = {
  /** Sampled numeric series. Empty series render a neutral baseline. */
  data: number[];
  /** Accessible description of the series (e.g. "Deployments over the last 7 days"). */
  label: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** Whether to draw a translucent area fill under the line. */
  fill?: boolean;
  className?: string;
};

/**
 * Accessible mini line chart. Exposed as an `<svg role="img">` with a `<title>`
 * so the shape is never the only source of meaning. Color comes from the
 * current text color (set via `className`), never from a fixed palette.
 */
export function Sparkline({
  data,
  label,
  width = 96,
  height = 32,
  strokeWidth = 1.5,
  fill = true,
  className
}: SparklineProps) {
  const padding = 2;

  if (data.length === 0) {
    return (
      <svg
        role="img"
        aria-label={label}
        className={cn("text-muted-foreground/40", className)}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <title>{label}</title>
        <line
          x1={padding}
          y1={height / 2}
          x2={width - padding}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const step = innerWidth / (data.length - 1);
  const toY = (value: number) => height - padding - ((value - min) / span) * innerHeight;

  const points = data.map(
    (value, index) => `${(index * step + padding).toFixed(2)},${toY(value).toFixed(2)}`
  );
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${(width - padding).toFixed(2)},${height} L${padding},${height} Z`;

  return (
    <svg
      role="img"
      aria-label={label}
      className={cn("overflow-visible text-current", className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <title>{label}</title>
      {fill ? <path d={areaPath} fill="currentColor" opacity="0.12" aria-hidden="true" /> : null}
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      />
    </svg>
  );
}
