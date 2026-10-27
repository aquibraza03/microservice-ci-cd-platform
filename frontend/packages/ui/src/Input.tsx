"use client";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@saas/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Text input primitive.
 * A11y: uses the native `<input>` so all keyboard/browser behaviors apply;
 * pair with a `<Label>` and wire `aria-invalid`/`aria-describedby` at call site.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  );
});
