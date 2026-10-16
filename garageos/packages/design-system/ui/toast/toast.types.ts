import type { ReactNode } from "react";

export type ToastVariant = "default" | "success" | "warning" | "danger" | "info";
export type ToastPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";

export interface Toast {
  /** Unique identifier */
  id: string;
  /** Toast title */
  title?: string;
  /** Toast description */
  description?: string;
  /** Visual variant */
  variant?: ToastVariant;
  /** Icon override */
  icon?: ReactNode;
  /** Action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Auto-dismiss duration in ms */
  duration?: number;
  /** Prevent auto-dismiss */
  persistent?: boolean;
}

export interface ToastProviderProps {
  children: ReactNode;
  /** Maximum visible toasts */
  maxVisible?: number;
  /** Default position */
  position?: ToastPosition;
  /** Default duration in ms */
  duration?: number;
  /** Localized accessible name of the notification region. */
  label?: string;
  /** Localized accessible name of the dismiss control. */
  dismissLabel?: string;
}

export interface CreateToast extends Omit<Toast, "id"> {}

export interface ToastContextValue {
  toasts: Toast[];
  toast: (toast: CreateToast) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  updateToast: (id: string, toast: Partial<CreateToast>) => void;
}
