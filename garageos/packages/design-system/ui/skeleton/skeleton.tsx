import React, { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../utils/cn";
import type { SkeletonProps } from "./skeleton.types";

// ─── Base Skeleton Block ──────────────────────────────────────
const SkeletonBlock = forwardRef<
  HTMLDivElement,
  { className?: string } & HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("animate-pulse rounded-md bg-muted/70", className)}
    {...props}
  />
));
SkeletonBlock.displayName = "SkeletonBlock";

// ─── Text Skeleton ────────────────────────────────────────────
const TextSkeleton = ({ lines = 3, width, height = "h-3" }: { lines?: number; width?: string; height?: string }) => (
  <div className="space-y-2.5" role="presentation" aria-label="Loading text">
    {Array.from({ length: lines }).map((_, i) => (
      <SkeletonBlock
        key={i}
        className={cn(
          height,
          width,
          i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"
        )}
        style={i === lines - 1 && lines > 1 ? undefined : width ? { width } : undefined}
      />
    ))}
  </div>
);

// ─── Avatar Skeleton ──────────────────────────────────────────
const avatarSizes: Record<string, string> = {
  xs: "size-6",
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
  xl: "size-16",
};

const AvatarSkeleton = ({
  size = "md",
  shape = "circle",
}: {
  size?: string;
  shape?: string;
}) => (
  <SkeletonBlock
    className={cn(
      avatarSizes[size] || avatarSizes.md,
      shape === "circle" ? "rounded-full" : "rounded-lg"
    )}
    role="presentation"
    aria-label="Loading avatar"
  />
);

// ─── Card Skeleton ────────────────────────────────────────────
const CardSkeleton = () => (
  <div
    className="p-4 border border-border rounded-xl space-y-3"
    role="presentation"
    aria-label="Loading card"
  >
    <SkeletonBlock className="h-4 w-1/3" />
    <SkeletonBlock className="h-3 w-2/3" />
    <SkeletonBlock className="h-20 w-full" />
    <div className="flex gap-2">
      <SkeletonBlock className="h-3 w-1/4" />
      <SkeletonBlock className="h-3 w-1/4" />
    </div>
  </div>
);

// ─── Table Row Skeleton ───────────────────────────────────────
const TableRowSkeleton = ({ columns = 5 }: { columns?: number }) => (
  <div
    className="flex items-center gap-4 py-3 border-b border-border last:border-0"
    role="presentation"
    aria-label="Loading table row"
  >
    <SkeletonBlock className="size-8 rounded-full shrink-0" />
    {Array.from({ length: columns - 1 }).map((_, i) => (
      <SkeletonBlock
        key={i}
        className={cn(
          "h-3",
          i === 0 ? "w-24" : i === 1 ? "w-32" : i === 2 ? "w-20" : "w-16"
        )}
      />
    ))}
  </div>
);

// ─── Chart Skeleton ───────────────────────────────────────────
const ChartSkeleton = () => (
  <div
    className="space-y-2"
    role="presentation"
    aria-label="Loading chart"
  >
    <div className="flex items-end gap-2 h-32">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className="flex-1"
          style={{ height: `${30 + Math.random() * 70}%` }}
        />
      ))}
    </div>
    <div className="flex gap-3">
      <SkeletonBlock className="h-2 flex-1" />
      <SkeletonBlock className="h-2 flex-1" />
      <SkeletonBlock className="h-2 flex-1" />
      <SkeletonBlock className="h-2 flex-1" />
    </div>
  </div>
);

// ─── Main Skeleton Component ──────────────────────────────────
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      className,
      variant = "text",
      lines,
      width,
      height,
      avatarSize,
      avatarShape,
      columns,
      ...props
    },
    ref
  ) => {
    const variantMap: Record<string, React.ReactNode> = {
      text: <TextSkeleton lines={lines} width={width} height={height} />,
      avatar: <AvatarSkeleton size={avatarSize} shape={avatarShape} />,
      card: <CardSkeleton />,
      "table-row": <TableRowSkeleton columns={columns} />,
      chart: <ChartSkeleton />,
    };

    const content = variant === "custom" ? null : variantMap[variant];

    if (variant === "custom") {
      return (
        <div
          ref={ref}
          role="presentation"
          aria-label="Loading"
          className={cn(
            "animate-pulse rounded-md bg-muted/70",
            width,
            height,
            className
          )}
          {...props}
        />
      );
    }

    return (
      <div
        ref={ref}
        className={cn(className)}
        role="presentation"
        aria-label={`Loading ${variant}`}
        {...props}
      >
        {content}
      </div>
    );
  }
);

Skeleton.displayName = "Skeleton";
