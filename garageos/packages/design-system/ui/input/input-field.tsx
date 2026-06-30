import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import type { InputFieldProps } from "./input.types";

export const InputField = forwardRef<HTMLDivElement, InputFieldProps>(
  ({ className, focused, invalid, disabled, size = "md", children, ...props }, ref) => {
    const sizeClasses = {
      sm: "h-8 px-2.5 text-sm rounded-md gap-1.5",
      md: "h-10 px-3 text-sm rounded-lg gap-2",
      lg: "h-12 px-4 text-base rounded-lg gap-2",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center w-full",
          "border border-border bg-background",
          "transition-all duration-150",
          "has-[input:focus]:ring-2 has-[input:focus]:ring-ring has-[input:focus]:ring-offset-1",
          "has-[input:focus]:border-primary",
          invalid && "border-danger has-[input:focus]:border-danger has-[input:focus]:ring-danger/20",
          focused && "border-primary ring-2 ring-ring ring-offset-1",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

InputField.displayName = "InputField";
