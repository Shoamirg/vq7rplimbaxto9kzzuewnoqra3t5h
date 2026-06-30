import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import type { InputRootProps } from "./input.types";

export const InputRoot = forwardRef<HTMLDivElement, InputRootProps>(
  ({ className, size = "md", invalid, disabled, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col gap-1.5 w-full",
          disabled && "opacity-50 pointer-events-none",
          className
        )}
        data-invalid={invalid || undefined}
        data-size={size}
        {...props}
      >
        {children}
      </div>
    );
  }
);

InputRoot.displayName = "InputRoot";
