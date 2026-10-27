"use client";
import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "@saas/utils";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

/** Form label primitive. Clicking focuses the associated control. */
export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, ...props },
  ref
) {
  return (
    <label
      ref={ref}
      className={cn(
        "text-sm font-medium leading-none",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  );
});
