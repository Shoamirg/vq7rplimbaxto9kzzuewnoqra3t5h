import type { HTMLAttributes } from "react";

export type SkeletonVariant = "text" | "avatar" | "card" | "table-row" | "chart" | "custom";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Pre-built skeleton shape */
  variant?: SkeletonVariant;
  /** Number of text lines (for variant="text") */
  lines?: number;
  /** Width class override */
  width?: string;
  /** Height class override (for variant="text", height is per-line) */
  height?: string;
  /** Avatar size (for variant="avatar") */
  avatarSize?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Avatar shape (for variant="avatar") */
  avatarShape?: "circle" | "square";
  /** Number of table columns (for variant="table-row") */
  columns?: number;
}
