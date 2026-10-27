"use client";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@saas/utils";

export const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive: "border-destructive/50 bg-destructive/10 text-destructive",
        success: "border-success/50 bg-success/10 text-success-foreground",
        warning: "border-warning/50 bg-warning/10 text-warning-foreground",
        info: "border-info/50 bg-info/10 text-info-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export type AlertProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & {
    /** Required short heading, read aloud by assistive technology. */
    title: string;
    /** Optional leading icon (e.g. a lucide icon). */
    icon?: ReactNode;
  };

/**
 * Inline status surface.
 * A11y: `role="alert"` is applied for destructive/warning variants so the
 * message is announced immediately; other variants use `role="status"`.
 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, variant, title, icon, children, ...props },
  ref
) {
  const live = variant === "destructive" || variant === "warning";
  return (
    <div
      ref={ref}
      role={live ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {icon}
      <div className="grid gap-1">
        <h5 className="font-medium leading-none tracking-tight">{title}</h5>
        {children ? <div className="text-sm opacity-90">{children}</div> : null}
      </div>
    </div>
  );
});
