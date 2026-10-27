"use client";
import { forwardRef, type SVGAttributes } from "react";
import { cn } from "@saas/utils";

export type SpinnerProps = SVGAttributes<SVGSVGElement> & {
  /** Accessible label (defaults to "Loading"). */
  label?: string;
};

/** Accessible loading indicator. `role="status"` announces via aria-live. */
export const Spinner = forwardRef<SVGSVGElement, SpinnerProps>(function Spinner(
  { className, label = "Loading", ...props },
  ref
) {
  return (
    <svg
      ref={ref}
      role="status"
      aria-label={label}
      className={cn("size-4 animate-spin text-current", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={false}
      {...props}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
});
