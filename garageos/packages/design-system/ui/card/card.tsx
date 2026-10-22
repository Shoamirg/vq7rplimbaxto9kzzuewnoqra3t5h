import React, { forwardRef, type HTMLAttributes } from "react";
import { Inbox } from "lucide-react";
import { cn } from "../../utils/cn";
import { Skeleton } from "../skeleton";
import type {
  CardProps,
  CardHeaderProps,
  CardContentProps,
  CardFooterProps,
  CardComponent,
} from "./card.types";

// ─── Card ─────────────────────────────────────────────────────
const variantClasses: Record<string, string> = {
  default: "bg-card text-card-foreground border border-white/65 shadow-bento dark:border-border",
  outline: "bg-background text-foreground border border-border",
  elevated: "bg-card text-card-foreground border border-white/65 shadow-bento dark:border-border",
  muted: "bg-muted/40 text-foreground border border-border/50",
};

const paddingClasses: Record<string, string> = {
  none: "p-0",
  sm: "p-[14px]",
  md: "p-[18px]",
  lg: "p-6",
};

const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant = "default",
      padding = "md",
      loading = false,
      empty = false,
      emptyMessage = "No data available",
      emptyAction,
      onClick,
      children,
      ...props
    },
    ref
  ) => {
    if (loading) {
      return (
        <div
          ref={ref}
          className={cn(
            "rounded-bento",
            variantClasses[variant],
            className
          )}
          {...props}
        >
          <div className={paddingClasses[padding]}>
            <Skeleton variant="card" />
          </div>
        </div>
      );
    }

    if (empty) {
      return (
        <div
          ref={ref}
          className={cn(
            "rounded-bento",
            variantClasses[variant],
            className
          )}
          {...props}
        >
          <div className={cn(paddingClasses[padding], "flex flex-col items-center justify-center py-12 text-center")}>
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Inbox className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground mb-3">{emptyMessage}</p>
            {emptyAction && <div>{emptyAction}</div>}
          </div>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-bento",
          variantClasses[variant],
          onClick && "cursor-pointer select-none hover:shadow-md active:shadow-xs transition-all duration-150",
          className
        )}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        {...props}
      >
        {children}
      </div>
    );
  }
) as CardComponent;

Card.displayName = "Card";

// ─── CardHeader ───────────────────────────────────────────────
export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, padding: paddingProp, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col space-y-1.5",
          paddingProp ? paddingClasses[paddingProp] : paddingClasses.md,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardHeader.displayName = "CardHeader";

// ─── CardTitle ────────────────────────────────────────────────
export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <h3
        ref={ref}
        className={cn("text-base font-semibold text-foreground leading-none tracking-tight", className)}
        {...props}
      >
        {children}
      </h3>
    );
  }
);

CardTitle.displayName = "CardTitle";

// ─── CardDescription ──────────────────────────────────────────
export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
      >
        {children}
      </p>
    );
  }
);

CardDescription.displayName = "CardDescription";

// ─── CardContent ──────────────────────────────────────────────
export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, padding: paddingProp, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          paddingProp ? paddingClasses[paddingProp] : paddingClasses.md,
          "pt-0",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardContent.displayName = "CardContent";

// ─── CardFooter ───────────────────────────────────────────────
export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, padding: paddingProp, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center border-t border-border",
          paddingProp ? paddingClasses[paddingProp] : paddingClasses.md,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = "CardFooter";

// Attach sub-components as properties (after all sub-components are defined)
Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Content = CardContent;
Card.Footer = CardFooter;

export { Card };
