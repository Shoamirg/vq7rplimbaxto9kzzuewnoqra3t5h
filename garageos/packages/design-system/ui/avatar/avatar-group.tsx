import React, { forwardRef, Children, cloneElement, isValidElement } from "react";
import { cn } from "../../utils/cn";
import type { AvatarGroupProps } from "./avatar.types";
import type { AvatarProps } from "./avatar.types";

export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ className, children, max = 4, size = "md", ...props }, ref) => {
    const items = Children.toArray(children).filter(isValidElement<AvatarProps>);
    const visible = items.slice(0, max);
    const overflow = items.length - max;

    const overflowSizeClasses: Record<string, string> = {
      xs: "size-6 text-[10px]",
      sm: "size-8 text-xs",
      md: "size-10 text-sm",
      lg: "size-12 text-base",
      xl: "size-16 text-xl",
    };

    return (
      <div
        ref={ref}
        className={cn("flex items-center -space-x-2", className)}
        {...props}
      >
        {visible.map((child, i) =>
          cloneElement(child, {
            key: i,
            size: size as AvatarProps["size"],
            className: cn("ring-2 ring-background", child.props.className),
          })
        )}
        {overflow > 0 && (
          <div
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-medium ring-2 ring-background",
              overflowSizeClasses[size]
            )}
            aria-label={`${overflow} more`}
          >
            <span className="text-xs leading-none">+{overflow}</span>
          </div>
        )}
      </div>
    );
  }
);

AvatarGroup.displayName = "AvatarGroup";
