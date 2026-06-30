import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import type { InputHelperProps } from "./input.types";

export const InputHelper = forwardRef<HTMLParagraphElement, InputHelperProps>(
  ({ className, error, children, ...props }, ref) => {
    if (!children) return null;
    return (
      <p
        ref={ref}
        className={cn(
          "text-xs",
          error ? "text-danger" : "text-muted-foreground",
          className
        )}
        role={error ? "alert" : undefined}
        {...props}
      >
        {children}
      </p>
    );
  }
);

InputHelper.displayName = "InputHelper";
