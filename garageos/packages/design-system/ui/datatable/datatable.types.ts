import type { ReactNode, HTMLAttributes, ComponentType } from "react";

export interface Column<T> {
  /** Unique column identifier */
  key: string;
  /** Column header label */
  header: string;
  /** Cell render function or accessor string (deep path like 'user.name') */
  accessor?: (row: T) => ReactNode;
  /** Sortable */
  sortable?: boolean;
  /** Column width or min-width */
  width?: string;
  /** Align content */
  align?: "left" | "center" | "right";
  /** Hide on mobile */
  hideOnMobile?: boolean;
  /** Custom cell component */
  cell?: (row: T) => ReactNode;
  /** Format as date */
  date?: boolean;
  /** Format as currency */
  currency?: boolean;
  /** Format as number with decimals */
  decimals?: number;
  /** Badge variant mapping */
  badge?: {
    variant: (value: unknown) => string;
  };
}

export interface DataTableProps<T> {
  /** Column definitions */
  columns: Column<T>[];
  /** Data rows */
  data: T[];
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Empty state action */
  emptyAction?: ReactNode;
  /** Row key accessor (default: 'id') */
  rowKey?: string | ((row: T) => string);
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Selection mode */
  selectable?: boolean;
  /** Selected row keys */
  selectedKeys?: Set<string>;
  /** Selection change handler */
  onSelectionChange?: (keys: Set<string>) => void;
  /** Sort state */
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (column: string, direction: "asc" | "desc") => void;
  /** Page size for pagination (0 = no pagination) */
  pageSize?: number;
  /** Current page */
  page?: number;
  /** Total items (for server-side pagination) */
  totalItems?: number;
  /** Page change handler */
  onPageChange?: (page: number) => void;
  /** Compact mode */
  compact?: boolean;
  /** Striped rows */
  striped?: boolean;
  /** Max height with scroll */
  maxHeight?: string;
  /** Show column headers */
  showHeader?: boolean;
  /** Class name */
  className?: string;
  /** Number of skeleton rows to show while loading */
  skeletonRows?: number;
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}
