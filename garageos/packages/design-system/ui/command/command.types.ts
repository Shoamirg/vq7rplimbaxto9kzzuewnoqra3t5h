import type { ReactNode, HTMLAttributes } from "react";

export interface CommandPaletteProps {
  /** Controlled open state */
  open?: boolean;
  /** Open state change handler */
  onOpenChange?: (open: boolean) => void;
  /** Whether the palette is open by default */
  defaultOpen?: boolean;
  /** Placeholder text for search input */
  placeholder?: string;
  /** Command groups and items */
  children?: ReactNode;
  /** Empty state message */
  emptyMessage?: string;
  /** Keyboard shortcut to open (default: cmd+k / ctrl+k) */
  triggerShortcut?: string;
  /** Custom trigger element */
  trigger?: ReactNode;
  /** Max height of results list */
  maxHeight?: string;
}

export interface CommandGroupProps {
  /** Group label */
  label?: string;
  /** Group items */
  children: ReactNode;
  /** Icon for the group label */
  icon?: ReactNode;
}

export interface CommandItemProps extends HTMLAttributes<HTMLDivElement> {
  /** Icon element */
  icon?: ReactNode;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Whether this item is selected */
  selected?: boolean;
  /** Value for search filtering */
  value?: string;
  /** Keywords for search matching */
  keywords?: string[];
  /** Click handler */
  onSelect?: () => void;
  /** Disabled state */
  disabled?: boolean;
}

export interface CommandSeparatorProps extends HTMLAttributes<HTMLDivElement> {}

export interface CommandEmptyProps extends HTMLAttributes<HTMLDivElement> {}
