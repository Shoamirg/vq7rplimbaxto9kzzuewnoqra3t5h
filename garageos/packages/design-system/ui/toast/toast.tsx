"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { X, CheckCircle, AlertTriangle, AlertCircle, Info, Bell } from "lucide-react";
import { cn } from "../../utils/cn";
import type { Toast, ToastProviderProps, CreateToast, ToastContextValue, ToastVariant } from "./toast.types";

// ─── Icon Mapping ─────────────────────────────────────────────
const variantIcons: Record<ToastVariant, React.ReactNode> = {
  default: <Bell className="size-5" />,
  success: <CheckCircle className="size-5 text-success" />,
  warning: <AlertTriangle className="size-5 text-warning" />,
  danger: <AlertCircle className="size-5 text-danger" />,
  info: <Info className="size-5 text-primary-500" />,
};

const variantClasses: Record<ToastVariant, string> = {
  default: "border-border bg-card",
  success: "border-success/30 bg-card",
  warning: "border-warning/30 bg-card",
  danger: "border-danger/30 bg-card",
  info: "border-primary-200 bg-card dark:border-primary-800",
};

const positionClasses: Record<string, string> = {
  "top-right": "fixed top-4 right-4",
  "top-left": "fixed top-4 left-4",
  "bottom-right": "fixed bottom-4 right-4",
  "bottom-left": "fixed bottom-4 left-4",
  "top-center": "fixed top-4 left-1/2 -translate-x-1/2",
  "bottom-center": "fixed bottom-4 left-1/2 -translate-x-1/2",
};

// ─── Context ──────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}

// ─── Provider ─────────────────────────────────────────────────
export function ToastProvider({
  children,
  maxVisible = 5,
  position = "bottom-right",
  duration = 5000,
  label = "Notifications",
  dismissLabel = "Dismiss",
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const toast = useCallback(
    (t: CreateToast) => {
      const id = `toast-${++counterRef.current}`;
      const newToast: Toast = { ...t, id };
      setToasts((prev) => [...prev, newToast].slice(-maxVisible));
      return id;
    },
    [maxVisible]
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<CreateToast>) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss, dismissAll, updateToast }}>
      {children}
      {/* Toast Container */}
      <div
        className={cn(
          "z-100 flex flex-col gap-2 pointer-events-none w-[calc(100vw-2rem)] max-w-sm",
          positionClasses[position]
        )}
        aria-live="polite"
        role="region" aria-label={label}
      >
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            toast={t}
            onDismiss={dismiss}
            duration={t.persistent ? undefined : t.duration ?? duration}
            dismissLabel={dismissLabel}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Toast Item ───────────────────────────────────────────────
function ToastItem({
  toast,
  onDismiss,
  duration,
  dismissLabel,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
  duration?: number;
  dismissLabel: string;
}) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!duration) return;
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, toast.id, onDismiss]);

  const icon = toast.icon || variantIcons[toast.variant || "default"];

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg",
        "max-w-sm w-full",
        "transition-all duration-200",
        exiting ? "opacity-0 translate-y-2 scale-95" : "opacity-100 translate-y-0 scale-100",
        variantClasses[toast.variant || "default"]
      )}
      role="alert"
      aria-hidden={exiting || undefined}
      inert={exiting || undefined}
    >
      <span className="shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-sm font-medium text-foreground">{toast.title}</p>
        )}
        {toast.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{toast.description}</p>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="mt-2 min-h-11 min-w-11 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => {
          setExiting(true);
          setTimeout(() => onDismiss(toast.id), 200);
        }}
        className="shrink-0 min-h-11 min-w-11 flex items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={dismissLabel}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// ─── Toast Direct Component (for declarative use) ─────────────
export function ToastComponent({
  title,
  description,
  variant = "default",
  icon,
  action,
  onClose,
  className,
}: {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  onClose?: () => void;
  className?: string;
}) {
  const resolvedIcon = icon || variantIcons[variant];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 shadow-lg max-w-sm w-full",
        variantClasses[variant],
        className
      )}
      role="alert"
    >
      <span className="shrink-0 mt-0.5">{resolvedIcon}</span>
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-medium text-foreground">{title}</p>}
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
        {action && (
          <button onClick={action.onClick} className="mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            {action.label}
          </button>
        )}
      </div>
      {onClose && (
        <button onClick={onClose} className="shrink-0 rounded-md p-1 opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
