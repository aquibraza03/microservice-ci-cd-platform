"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@saas/utils";

export type PaginationProps = {
  /** Current page (1-based). */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label?: string;
  className?: string;
};

function pageItems(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const candidates = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...candidates].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) items.push("ellipsis");
    items.push(page);
    previous = page;
  }
  return items;
}

/**
 * Accessible pagination control. Previous/next buttons plus a window of page
 * numbers; the active page is announced via `aria-current="page"`.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  label = "Pagination",
  className
}: PaginationProps) {
  if (pageCount <= 1) return null;

  const canPrevious = page > 1;
  const canNext = page < pageCount;

  return (
    <nav aria-label={label} className={cn("flex items-center gap-1", className)}>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        onClick={() => onPageChange(page - 1)}
        disabled={!canPrevious}
        aria-label="Previous page"
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      {pageItems(page, pageCount).map((item, index) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            className="px-1 text-sm text-muted-foreground"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? "default" : "outline"}
            size="icon"
            className="size-8"
            onClick={() => onPageChange(item)}
            aria-current={item === page ? "page" : undefined}
            aria-label={`Page ${item}`}
          >
            {item}
          </Button>
        )
      )}
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        onClick={() => onPageChange(page + 1)}
        disabled={!canNext}
        aria-label="Next page"
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
