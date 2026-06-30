import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import type { InputSuffixProps } from "./input.types";

export const InputSuffix = forwardRef<HTMLSpanElement, InputSuffixProps>(
  ({ className, size = "md", children, ...props }, ref) => {
    if (!children) return null;
    const sizeClasses = {
      sm: "size-3.5",
      md: "size-4",
      lg: "size-5",
    };
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center shrink-0 text-muted-foreground",
          sizeClasses[size],
          className
        )}
        aria-hidden="true"
        {...props}
      >
        {children}
      </span>
    );
  }
);

InputSuffix.displayName = "InputSuffix";
