"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@saas/utils";

const dotVariants = cva("size-2 shrink-0 rounded-full", {
  variants: {
    tone: {
      neutral: "bg-muted-foreground",
      info: "bg-info",
      success: "bg-success",
      warning: "bg-warning",
      destructive: "bg-destructive",
      primary: "bg-primary"
    }
  },
  defaultVariants: { tone: "neutral" }
});

export type StatusBadgeTone = NonNullable<VariantProps<typeof dotVariants>["tone"]>;

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  /** Semantic tone — the accessible text label always accompanies the color. */
  tone?: StatusBadgeTone;
  /** Optional leading icon (decorative). */
  icon?: ReactNode;
};

/**
 * Semantic status indicator. Never relies on color alone: the label text (or an
 * explicit `aria-label`) always conveys the status. Used consistently across
 * the dashboard, tables, and panels.
 */
export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(function StatusBadge(
  { className, tone = "neutral", icon, children, ...props },
  ref
) {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80",
        className
      )}
      {...props}
    >
      <span className={cn(dotVariants({ tone }))} aria-hidden="true" />
      {icon ? (
        <span
          className="[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
    </span>
  );
});
