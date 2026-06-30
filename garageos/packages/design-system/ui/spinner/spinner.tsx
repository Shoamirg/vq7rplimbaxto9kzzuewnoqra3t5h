import React, { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../utils/cn";
import type { SpinnerProps } from "./spinner.types";

const sizeMap = {
  xs: "size-3",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
} as const;

const labelSizeMap = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-sm",
  lg: "text-base",
} as const;

export const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  (
    {
      className,
      size = "sm",
      label,
      centered = false,
      inline = true,
      ...props
    },
    ref
  ) => {
    const content = (
      <>
        <Loader2
          className={cn("animate-spin text-muted-foreground", sizeMap[size])}
          aria-hidden="true"
        />
        {label && (
          <span className={cn("text-muted-foreground", labelSizeMap[size])}>
            {label}
          </span>
        )}
      </>
    );

    if (centered) {
      return (
        <div
          ref={ref}
          role="status"
          aria-label={label || "Loading"}
          className={cn(
            "flex flex-col items-center justify-center gap-2 py-8",
            className
          )}
          {...props}
        >
          {content}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        role="status"
        aria-label={label || "Loading"}
        className={cn(
          "inline-flex items-center gap-2",
          inline ? "inline-flex" : "flex",
          className
        )}
        {...props}
      >
        {content}
      </div>
    );
  }
);

Spinner.displayName = "Spinner";
