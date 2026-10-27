"use client";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@saas/utils";

export type PageHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: string;
  /** Right-aligned actions (buttons, links, filters). */
  actions?: ReactNode;
  /** Optional status line rendered below the description (e.g. last updated). */
  meta?: ReactNode;
};

/**
 * Standard page header: title + description + actions + optional meta.
 * Keeps page composition consistent across the dashboard, projects, and
 * section pages.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {meta ? <div className="pt-1 text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
