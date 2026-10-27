"use client";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@saas/utils";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./Table";

export type DataTableColumn<TData> = ColumnDef<TData>;

export type DataTableProps<TData> = {
  data: TData[];
  columns: DataTableColumn<TData>[];
  /** Stable row identity. */
  rowKey: (row: TData) => string;
  /** Client-side substring filter applied across stringified row values. */
  searchValue?: string;
  /** Optional predicate applied before the search filter (e.g. status). */
  filter?: (row: TData) => boolean;
  pageSize?: number;
  loading?: boolean;
  /** Rendered instead of rows when there is no data to show. */
  empty?: ReactNode;
  /** Initial sort state, e.g. `[{ id: "lastActivityAt", desc: true }]`. */
  defaultSort?: SortingState;
  /** Optional action row rendered below the table (e.g. pagination). */
  footer?: ReactNode;
  className?: string;
};

function matchesSearch(value: unknown, needle: string): boolean {
  if (value == null) return false;
  return String(value).toLowerCase().includes(needle);
}

/**
 * Reusable data table: client-side search, sorting, and pagination over a
 * fetched dataset. Loading renders skeleton rows; no data renders `empty`;
 * sort controls are real buttons with accessible labels (never color-only).
 */
export function DataTable<TData>({
  data,
  columns,
  rowKey,
  searchValue = "",
  filter,
  pageSize = 10,
  loading = false,
  empty,
  defaultSort,
  footer,
  className
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSort ?? []);

  const filteredData = useMemo(() => {
    const rows = filter ? data.filter(filter) : data;
    if (!searchValue) return rows;
    const needle = searchValue.toLowerCase();
    return rows.filter((row) =>
      Object.values(row as Record<string, unknown>).some((v) => matchesSearch(v, needle))
    );
  }, [data, filter, searchValue]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } }
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  return (
    <div className={cn("space-y-3", className)} aria-busy={loading || undefined}>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const content = flexRender(header.column.columnDef.header, header.getContext());
                  if (!canSort) {
                    return <TableHead key={header.id}>{content}</TableHead>;
                  }
                  return (
                    <TableHead key={header.id}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`Sort by ${
                          String(content ?? "")
                            .replace(/<[^>]*>/g, "")
                            .trim() || "column"
                        }`}
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : undefined
                        }
                      >
                        {content}
                        <span aria-hidden="true" className="text-muted-foreground/70">
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ArrowUpDown className="size-3.5" />
                          )}
                        </span>
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: Math.min(pageSize, 5) }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  {columns.map((column) => (
                    <TableCell key={column.id}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 p-0">
                  {empty ?? <EmptyState title="No results" />}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={rowKey(row.original)} data-state={undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && pageCount > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Showing page {pageIndex + 1} of {pageCount}
          </p>
          <nav aria-label="Pagination" className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span className="min-w-8 text-center text-sm tabular-nums">
              {pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        </div>
      ) : null}

      {footer}
    </div>
  );
}
