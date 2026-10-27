"use client";
import type { CSSProperties } from "react";
import { cn } from "@saas/utils";
import type { StatusBadgeTone } from "./StatusBadge";

export type DonutSegment = {
  /** Numeric share of the whole (>= 0). */
  value: number;
  label: string;
  tone: StatusBadgeTone;
};

export type DonutProps = {
  segments: DonutSegment[];
  /** Accessible summary of the whole chart (e.g. "Succeeded 24, Failed 6"). */
  label: string;
  size?: number;
  strokeWidth?: number;
  /** Optional value rendered in the centre (decorative text). */
  centerValue?: string | number | null;
  /** Optional label rendered under the centre value. */
  centerLabel?: string | null;
  className?: string;
};

const TONE_COLOR: Record<StatusBadgeTone, string> = {
  neutral: "hsl(var(--muted-foreground))",
  info: "hsl(var(--info))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  destructive: "hsl(var(--destructive))",
  primary: "hsl(var(--primary))"
};

/**
 * Accessible donut chart. The shape is described by an `aria-label`; the
 * centre value is decorative (`aria-hidden`) and a text legend is always
 * rendered by the caller — never colour alone.
 */
export function Donut({
  segments,
  label,
  size = 96,
  strokeWidth = 12,
  centerValue,
  centerLabel,
  className
}: DonutProps) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs =
    total > 0
      ? segments.map((segment) => {
          const fraction = Math.max(0, segment.value) / total;
          const dash = fraction * circumference;
          const arc = { tone: segment.tone, dash, gap: circumference - dash, offset };
          offset += dash;
          return arc;
        })
      : [];

  return (
    <svg
      role="img"
      aria-label={label}
      className={cn("shrink-0", className)}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <title>{label}</title>
      <g
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--muted))"
          aria-hidden="true"
        />
        {arcs.map((arc, index) => (
          <circle
            key={index}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={TONE_COLOR[arc.tone]}
            strokeDasharray={`${Math.max(0, arc.dash - 2)} ${arc.gap + 2}`}
            strokeDashoffset={-arc.offset}
            aria-hidden="true"
          />
        ))}
      </g>
      {(centerValue ?? centerLabel) ? (
        <g
          textAnchor="middle"
          fill="currentColor"
          aria-hidden="true"
          style={{ color: "hsl(var(--foreground))" } as CSSProperties}
        >
          {centerValue !== undefined && centerValue !== null ? (
            <text
              x="50%"
              y={centerLabel ? "47%" : "50%"}
              className="text-lg font-semibold"
              dominantBaseline="middle"
            >
              {centerValue}
            </text>
          ) : null}
          {centerLabel ? (
            <text
              x="50%"
              y={centerValue !== undefined && centerValue !== null ? "62%" : "50%"}
              dominantBaseline="middle"
            >
              <tspan fontSize={10}>{centerLabel}</tspan>
            </text>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}
