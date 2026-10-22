import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import type { InputFieldProps } from "./input.types";

export const InputField = forwardRef<HTMLDivElement, InputFieldProps>(
  ({ className, focused, invalid, disabled, size = "md", children, ...props }, ref) => {
    const sizeClasses = {
      sm: "h-11 px-4 text-sm rounded-full gap-1.5",
      md: "h-[52px] px-[22px] text-sm rounded-full gap-2",
      lg: "h-14 px-[22px] text-base rounded-full gap-2",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center w-full",
          "border border-transparent bg-input has-[input:focus]:bg-elevated",
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
