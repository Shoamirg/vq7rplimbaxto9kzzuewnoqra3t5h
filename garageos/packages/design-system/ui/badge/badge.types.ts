import type { HTMLAttributes } from "react";

export type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "info" | "neutral";
export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Color variant */
  variant?: BadgeVariant;
  /** Size variant */
  size?: BadgeSize;
  /** Show dot indicator before text */
  dot?: boolean;
  /** Make badge fully rounded (pill shape) */
  pill?: boolean;
  /** Remove left/right padding for icon-only badges */
  iconOnly?: boolean;
}
