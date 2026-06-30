"use client";

import React, { forwardRef, useState } from "react";
import { User } from "lucide-react";
import { cn } from "../../utils/cn";
import type { AvatarProps } from "./avatar.types";

const sizeClasses: Record<string, string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-xl",
};

const statusClasses: Record<string, string> = {
  online: "bg-success",
  offline: "bg-muted-foreground",
  away: "bg-warning",
  busy: "bg-danger",
};

const statusSizeClasses: Record<string, string> = {
  xs: "size-1.5 ring-1",
  sm: "size-2 ring-1",
  md: "size-2.5 ring-2",
  lg: "size-3 ring-2",
  xl: "size-3.5 ring-2",
};

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      className,
      src,
      alt = "",
      fallback,
      fallbackIcon,
      size = "md",
      status,
      shape = "circle",
      loading = false,
      ringColor = "ring-background",
      ...props
    },
    ref
  ) => {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const showImage = src && !imageError && !loading;
    const showFallback = !showImage || loading;

    // Get initials from fallback string
    const initials = fallback
      ? fallback
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : null;

    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
          "font-medium text-foreground/80",
          shape === "circle" ? "rounded-full" : "rounded-lg",
          sizeClasses[size],
          loading && "animate-pulse bg-muted",
          ringColor && `ring-2 ${ringColor}`,
          className
        )}
        role={status ? "status" : undefined}
        aria-label={alt || fallback || "Avatar"}
        {...props}
      >
        {showImage && (
          <img
            src={src}
            alt={alt}
            className="object-cover w-full h-full"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}
        {showFallback && (
          <span className="flex items-center justify-center w-full h-full bg-muted" aria-hidden={!!imageError}>
            {loading ? null : initials ? (
              <span className="font-medium leading-none select-none">{initials}</span>
            ) : (
              fallbackIcon || <User className="size-1/2 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
        )}

        {/* Status indicator */}
        {status && (
          <span
            className={cn(
              "absolute bottom-0 right-0 rounded-full",
              statusClasses[status],
              statusSizeClasses[size],
              ringColor && `ring-2 ${ringColor}`,
              shape === "square" && "translate-x-1/4 translate-y-1/4"
            )}
            aria-label={status}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";
