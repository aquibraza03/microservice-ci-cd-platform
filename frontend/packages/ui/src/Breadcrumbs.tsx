"use client";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@saas/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
  /** Marks the current page (rendered without a link, `aria-current="page"`). */
  current?: boolean;
};

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  /** Accessible name for the navigation landmark. */
  label?: string;
  className?: string;
  /**
   * Custom link renderer. Pass e.g. `next/link` from the host application to
   * opt into client-side navigation; defaults to a plain anchor so the design
   * system stays framework-agnostic.
   */
  renderLink?: (item: BreadcrumbItem) => ReactNode;
};

/**
 * Breadcrumb navigation. The current page is a non-link element annotated with
 * `aria-current="page"`; previous items are links.
 */
export function Breadcrumbs({
  items,
  label = "Breadcrumb",
  className,
  renderLink
}: BreadcrumbsProps) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          let content: ReactNode;
          if (item.href && !item.current) {
            content = renderLink ? (
              renderLink(item)
            ) : (
              <a
                href={item.href}
                className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </a>
            );
          } else {
            content = (
              <span
                aria-current={isLast ? "page" : undefined}
                className={cn(isLast ? "font-medium text-foreground" : "text-muted-foreground")}
              >
                {item.label}
              </span>
            );
          }

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {content}
              {!isLast ? (
                <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
