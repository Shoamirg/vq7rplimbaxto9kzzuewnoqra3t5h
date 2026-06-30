"use client";

import React, { useState, useMemo, useCallback, type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "../../utils/cn";
import { Skeleton } from "../skeleton";
import type { DataTableProps, Column, PaginationProps } from "./datatable.types";

// ─── Pagination ───────────────────────────────────────────────
function Pagination({ page, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <span className="text-xs text-muted-foreground">
        {Math.min((page - 1) * pageSize + 1, totalItems)}–{Math.min(page * pageSize, totalItems)} of{" "}
        {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="First page"
        >
          <ChevronsLeft className="size-4" />
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        {getPageNumbers(page, totalPages).map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={cn(
                "min-w-[28px] h-7 rounded text-xs font-medium transition-colors",
                p === page
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground"
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Last page"
        >
          <ChevronsRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, "...", total];
  if (current >= total - 2) return [1, "...", total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}

// ─── Sort Header ──────────────────────────────────────────────
function SortHeader({
  column,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: Column<unknown>;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (column: string, direction: "asc" | "desc") => void;
}) {
  const isSorted = sortColumn === column.key;
  return (
    <button
      onClick={() => {
        if (!onSort) return;
        if (isSorted) {
          onSort(column.key, sortDirection === "asc" ? "desc" : "asc");
        } else {
          onSort(column.key, "asc");
        }
      }}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider select-none",
        "transition-colors hover:text-foreground",
        isSorted ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {column.header}
      {isSorted && column.sortable && (
        <span className="inline-flex flex-col">
          <ChevronUp className={cn("size-3 -mb-1", sortDirection === "asc" ? "opacity-100" : "opacity-30")} />
          <ChevronDown className={cn("size-3", sortDirection === "desc" ? "opacity-100" : "opacity-30")} />
        </span>
      )}
    </button>
  );
}

// ─── DataTable ────────────────────────────────────────────────
export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = "No data available.",
  emptyAction,
  rowKey = "id",
  onRowClick,
  selectable,
  selectedKeys: controlledSelectedKeys,
  onSelectionChange,
  sortColumn: controlledSortColumn,
  sortDirection: controlledSortDirection,
  onSort: controlledOnSort,
  pageSize = 0,
  page: controlledPage,
  totalItems: controlledTotalItems,
  onPageChange: controlledOnPageChange,
  compact = false,
  striped = false,
  maxHeight,
  showHeader = true,
  className,
  skeletonRows = 5,
}: DataTableProps<T>) {
  // ── Internal state for uncontrolled mode ──
  const [internalSortColumn, setInternalSortColumn] = useState<string>("");
  const [internalSortDirection, setInternalSortDirection] = useState<"asc" | "desc">("asc");
  const [internalPage, setInternalPage] = useState(1);
  const [internalSelectedKeys, setInternalSelectedKeys] = useState<Set<string>>(new Set());

  const sortColumn = controlledSortColumn ?? internalSortColumn;
  const sortDirection = controlledSortDirection ?? internalSortDirection;
  const page = controlledPage ?? internalPage;
  const selectedKeys = controlledSelectedKeys ?? internalSelectedKeys;

  // ── Sorting handler ──
  const handleSort = useCallback(
    (col: string, dir: "asc" | "desc") => {
      if (controlledOnSort) {
        controlledOnSort(col, dir);
      } else {
        setInternalSortColumn(col);
        setInternalSortDirection(dir);
      }
    },
    [controlledOnSort]
  );

  // ── Page change handler ──
  const handlePageChange = useCallback(
    (p: number) => {
      if (controlledOnPageChange) {
        controlledOnPageChange(p);
      } else {
        setInternalPage(p);
      }
    },
    [controlledOnPageChange]
  );

  // ── Get row key ──
  const getRowKey = useCallback(
    (row: T): string => {
      if (typeof rowKey === "function") return rowKey(row);
      return String(row[rowKey as string] ?? "");
    },
    [rowKey]
  );

  // ── Sort data ──
  const sortedData = useMemo(() => {
    if (!sortColumn) return data;
    const col = columns.find((c) => c.key === sortColumn);
    if (!col) return data;

    const sorted = [...data].sort((a, b) => {
      const aVal = getCellValue(a, col);
      const bVal = getCellValue(b, col);
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let cmp = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data, sortColumn, sortDirection, columns]);

  // ── Paginate data ──
  const paginatedData = useMemo(() => {
    if (pageSize <= 0) return sortedData;
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, pageSize, page]);

  const totalItems = controlledTotalItems ?? data.length;
  const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 1;

  // ── Selection handlers ──
  const toggleSelect = useCallback(
    (key: string) => {
      const next = new Set(selectedKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);

      if (onSelectionChange) {
        onSelectionChange(next);
      } else {
        setInternalSelectedKeys(next);
      }
    },
    [selectedKeys, onSelectionChange]
  );

  const toggleSelectAll = useCallback(() => {
    const allVisibleKeys = paginatedData.map((row) => getRowKey(row));
    const allSelected = allVisibleKeys.every((k) => selectedKeys.has(k));
    const next = allSelected
      ? new Set([...selectedKeys].filter((k) => !allVisibleKeys.includes(k)))
      : new Set([...selectedKeys, ...allVisibleKeys]);

    if (onSelectionChange) {
      onSelectionChange(next);
    } else {
      setInternalSelectedKeys(next);
    }
  }, [paginatedData, selectedKeys, getRowKey, onSelectionChange]);

  // Helper to get cell value
  function getCellValue(row: T, col: Column<T>): unknown {
    if (col.accessor) return col.accessor(row);
    return (row as Record<string, unknown>)[col.key];
  }

  // Helper to render cell content
  function renderCell(row: T, col: Column<T>): ReactNode {
    const value = getCellValue(row, col);

    if (col.cell) return col.cell(row);
    if (col.badge && col.badge.variant) {
      const variant = col.badge.variant(value);
      return <BadgeCell variant={variant}>{String(value ?? "")}</BadgeCell>;
    }
    if (col.date && typeof value === "string") {
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return value;
      }
    }
    if (col.currency && typeof value === "number") {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
    }
    if (col.decimals !== undefined && typeof value === "number") {
      return value.toFixed(col.decimals);
    }
    return String(value ?? "");
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className={cn("rounded-lg border border-border", className)}>
        <DataTableSkeleton columns={columns.length} rows={skeletonRows} selectable={selectable} />
      </div>
    );
  }

  // ── Empty state ──
  if (!data.length) {
    return (
      <div className={cn("rounded-lg border border-border", className)}>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          {emptyAction && <div className="mt-3">{emptyAction}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden", className)}>
      <div className="overflow-x-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full">
          {showHeader && (
            <thead>
              <tr className="border-b border-border">
                {selectable && (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={paginatedData.every((row) => selectedKeys.has(getRowKey(row)))}
                      onChange={toggleSelectAll}
                      className="rounded border-border"
                      aria-label="Select all"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-3 py-3 text-left",
                      compact ? "py-2.5" : "py-3",
                      col.hideOnMobile && "hidden md:table-cell",
                      col.align === "center" && "text-center",
                      col.align === "right" && "text-right"
                    )}
                    style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  >
                    {col.sortable ? (
                      <SortHeader
                        column={col as Column<unknown>}
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={(key, dir) => handleSort(key, dir)}
                      />
                    ) : (
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {col.header}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {paginatedData.map((row, rowIndex) => {
              const key = getRowKey(row);
              const isSelected = selectedKeys.has(key);
              return (
                <tr
                  key={key}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors",
                    onRowClick && "cursor-pointer hover:bg-muted/50",
                    striped && rowIndex % 2 === 1 && "bg-muted/20",
                    isSelected && "bg-primary/5"
                  )}
                  onClick={() => onRowClick?.(row)}
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {selectable && (
                    <td className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(key)}
                        className="rounded border-border"
                        aria-label={`Select row ${rowIndex + 1}`}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 text-sm",
                        compact ? "py-2" : "py-3",
                        col.hideOnMobile && "hidden md:table-cell",
                        col.align === "center" && "text-center",
                        col.align === "right" && "text-right"
                      )}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageSize > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}

// ─── Badge Cell ───────────────────────────────────────────────
function BadgeCell({ variant, children }: { variant: string; children: ReactNode }) {
  const colorMap: Record<string, string> = {
    default: "bg-primary/10 text-primary border-primary/20",
    success: "bg-success/15 text-success border-success/25",
    warning: "bg-warning/15 text-warning border-warning/25",
    danger: "bg-danger/15 text-danger border-danger/25",
    info: "bg-blue-100 text-blue-700 border-blue-200",
    neutral: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        colorMap[variant] || colorMap.default
      )}
    >
      {children}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────
function DataTableSkeleton({
  columns,
  rows,
  selectable,
}: {
  columns: number;
  rows: number;
  selectable?: boolean;
}) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border">
          {selectable && <th className="w-10 px-3 py-3" />}
          {Array.from({ length: columns }).map((_, i) => (
            <th key={i} className="px-3 py-3">
              <Skeleton variant="custom" className="h-3 w-20" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <tr key={rowIdx} className="border-b border-border">
            {selectable && (
              <td className="w-10 px-3 py-3">
                <Skeleton variant="custom" className="size-4 rounded" />
              </td>
            )}
            {Array.from({ length: columns }).map((_, colIdx) => (
              <td key={colIdx} className="px-3 py-3">
                <Skeleton
                  variant="custom"
                  className={cn("h-3", colIdx === 0 ? "w-24" : colIdx === 1 ? "w-32" : "w-20")}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
