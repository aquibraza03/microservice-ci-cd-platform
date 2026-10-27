"use client";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@saas/utils";

export type ProgressProps = ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>;

/**
 * Determinate progress bar. Announces its value through the native
 * `progressbar` role (value + text alternative). Accepts `max` via Radix.
 */
export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { className, value = 0, max = 100, dir = "ltr", ...props },
  ref
) {
  const current = value ?? 0;
  const percent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const clamped = max > 0 ? Math.max(0, Math.min(max, current)) : 0;
  const translateX = dir === "rtl" ? `${100 - percent}%` : `-${100 - percent}%`;

  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={clamped}
      max={max}
      dir={dir}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-primary transition-transform"
        style={{ transform: `translateX(${translateX})` }}
      />
    </ProgressPrimitive.Root>
  );
});
