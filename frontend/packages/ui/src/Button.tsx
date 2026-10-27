"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@saas/utils";
import { Spinner } from "./Spinner";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Compose with Radix Slot: render the button styles on a child (e.g. a link). */
    asChild?: boolean;
    /** Shows a spinner, sets aria-busy, and disables the control. */
    loading?: boolean;
    /** Custom loading indicator (defaults to the built-in spinner). */
    loadingIndicator?: ReactNode;
  };

/**
 * Primary interaction primitive.
 *
 * A11y: real `<button>` (or composed child), keyboard focusable, disabled state
 * communicated via `disabled` + `aria-disabled`, loading state via `aria-busy`.
 * Contains NO business logic, NO HTTP, NO global state.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    asChild = false,
    loading = false,
    loadingIndicator,
    disabled,
    children,
    type,
    ...props
  },
  ref
) {
  const Comp = asChild ? Slot : "button";
  const isDisabled = disabled || loading;

  const content = loading ? (
    <span className="inline-flex items-center gap-2" aria-hidden="false">
      {loadingIndicator ?? <Spinner className="size-4" />}
      {children}
    </span>
  ) : (
    children
  );

  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...props}
    >
      {content}
    </Comp>
  );
});
