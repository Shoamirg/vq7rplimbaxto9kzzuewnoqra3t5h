import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import type { InputLabelProps } from "./input.types";

export const InputLabel = forwardRef<HTMLLabelElement, InputLabelProps>(
  ({ className, required, children, ...props }, ref) => {
    if (!children) return null;
    return (
      <label
        ref={ref}
        className={cn(
          "text-sm font-medium text-foreground",
          className
        )}
        {...props}
      >
        {children}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
    );
  }
);

InputLabel.displayName = "InputLabel";
