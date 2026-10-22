import React, { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";
import { Spinner } from "../spinner";
import type { ButtonProps } from "./button.types";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/80",
        secondary:
          "bg-muted text-foreground hover:bg-muted/80 active:bg-muted/70",
        outline:
          "border border-border bg-background hover:bg-muted active:bg-muted/70",
        ghost:
          "text-foreground hover:bg-muted active:bg-muted/70",
        danger:
          "bg-danger-action text-white shadow-xs hover:bg-danger-action/90 active:bg-danger-action/80",
        success:
          "bg-conversion text-white shadow-xs hover:bg-conversion/90 active:bg-conversion/80",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "min-h-11 min-w-11 px-2.5 text-xs rounded-full gap-1.5",
        sm: "min-h-11 min-w-11 px-3 text-sm rounded-full gap-1.5",
        md: "min-h-[52px] min-w-11 px-7 py-2",
        lg: "min-h-[52px] px-7 text-base",
        icon: "h-11 w-11 min-w-[44px]",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      disabled,
      leftIcon,
      rightIcon,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={cn(
          buttonVariants({ variant, size, fullWidth }),
          loading && "relative cursor-wait",
          className
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        {...props}
      >
        {loading ? (
          <Spinner size="sm" />
        ) : leftIcon ? (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}
        {children && (
          <span className={cn(loading && "opacity-70")}>
            {children}
          </span>
        )}
        {!loading && rightIcon && (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
