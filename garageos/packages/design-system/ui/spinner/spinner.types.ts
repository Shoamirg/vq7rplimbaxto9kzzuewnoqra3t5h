import type { HTMLAttributes } from "react";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  /** Size variant */
  size?: SpinnerSize;
  /** Optional label displayed beside the spinner */
  label?: string;
  /** Centers the spinner in its container */
  centered?: boolean;
  /** Show as inline element (default) */
  inline?: boolean;
}
