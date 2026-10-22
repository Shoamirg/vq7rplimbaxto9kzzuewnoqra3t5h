import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import type { BadgeProps } from "./badge.types";

const variantClasses: Record<string, string> = {
  default: "bg-primary/10 text-primary border-primary/20",
  primary: "bg-primary text-primary-foreground border-primary",
  success: "bg-success/15 text-success border-success/25",
  warning: "bg-warning/15 text-warning border-warning/25",
  danger: "bg-danger/15 text-danger border-danger/25",
  info: "bg-primary-100 text-primary-700 border-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:border-primary-800",
  neutral: "bg-muted text-muted-foreground border-border",
};

const sizeClasses: Record<string, string> = {
  sm: "px-1.5 py-0.5 text-[10px] leading-[14px] gap-1",
  md: "px-2 py-0.5 text-xs leading-[16px] gap-1",
  lg: "px-2.5 py-1 text-sm leading-[18px] gap-1.5",
};

const dotColorClasses: Record<string, string> = {
  default: "bg-primary",
  primary: "bg-primary-foreground",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-primary-600 dark:bg-primary-400",
  neutral: "bg-muted-foreground",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      dot = false,
      pill = false,
      iconOnly = false,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center font-medium border",
          "transition-colors duration-150",
          variantClasses[variant],
          sizeClasses[size],
          pill ? "rounded-full" : "rounded-md",
          iconOnly && "p-1",
          className
        )}
        {...props}
      >
        {dot && (
          <span
            className={cn(
              "inline-block rounded-full",
              size === "sm" ? "size-1.5" : size === "lg" ? "size-2.5" : "size-2",
              dotColorClasses[variant]
            )}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";
