import type { ReactNode, HTMLAttributes } from "react";

export interface DropdownMenuContentProps extends HTMLAttributes<HTMLDivElement> {
  /** Align relative to trigger */
  align?: "start" | "center" | "end";
  /** Side to display */
  side?: "top" | "bottom" | "left" | "right";
  /** Offset from trigger */
  sideOffset?: number;
  /** Max height */
  maxHeight?: string;
  /** Min width */
  minWidth?: string;
}

export interface DropdownMenuItemProps extends HTMLAttributes<HTMLDivElement> {
  /** Show destructive styling */
  destructive?: boolean;
  /** Icon element */
  icon?: ReactNode;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Click handler */
  onSelect?: () => void;
}

export interface DropdownMenuLabelProps extends HTMLAttributes<HTMLDivElement> {
  /** Include separator below label */
  inset?: boolean;
}

export interface DropdownMenuSeparatorProps extends HTMLAttributes<HTMLDivElement> {}

export interface DropdownMenuGroupProps {
  children: ReactNode;
  /** Optional group label */
  label?: string;
}
