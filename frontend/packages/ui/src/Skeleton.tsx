"use client";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@saas/utils";

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/**
 * Loading placeholder. Shimmer-free (respects reduced-motion) pulse block.
 * A11y: pair with `aria-busy` on the container; do not place interactive
 * content inside a skeleton.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden="true"
      {...props}
    />
  );
});
