import type { HTMLAttributes, ReactNode } from "react";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export type AvatarStatus = "online" | "offline" | "away" | "busy";

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** Image URL */
  src?: string;
  /** Alt text for the image */
  alt?: string;
  /** Fallback initials (e.g. "JD" for John Doe) */
  fallback?: string;
  /** Custom fallback icon */
  fallbackIcon?: ReactNode;
  /** Size variant */
  size?: AvatarSize;
  /** Online/offline status indicator */
  status?: AvatarStatus;
  /** Shape variant */
  shape?: "circle" | "square";
  /** Show skeleton while image loads */
  loading?: boolean;
  /** Ring/border color class */
  ringColor?: string;
}

export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Avatar items to stack */
  children: ReactNode;
  /** Max avatars to show before +N overflow */
  max?: number;
  /** Size passed to all child avatars */
  size?: AvatarSize;
}
