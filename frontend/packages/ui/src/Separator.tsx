"use client";
import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@saas/utils";

export const separatorVariants = cva("bg-border", {
  variants: {
    orientation: {
      horizontal: "h-px w-full",
      vertical: "h-full w-px"
    }
  },
  defaultVariants: {
    orientation: "horizontal"
  }
});

export type SeparatorProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof separatorVariants> & {
    /** Accessible label for the decorative separator. */
    "aria-label"?: string;
  };

/** Visual divider. Decorative (aria-hidden) unless an explicit label is given. */
export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { className, orientation = "horizontal", "aria-label": ariaLabel, ...props },
  ref
) {
  const withLabel = ariaLabel !== undefined && ariaLabel !== null;
  return (
    <div
      ref={ref}
      role={withLabel ? "separator" : undefined}
      aria-label={ariaLabel}
      aria-orientation={withLabel ? (orientation ?? "horizontal") : undefined}
      aria-hidden={withLabel ? undefined : true}
      className={cn(separatorVariants({ orientation }), className)}
      {...props}
    />
  );
});
