import { type ReactNode, type ButtonHTMLAttributes } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success"
  | "link";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Size variant */
  size?: ButtonSize;
  /** Show loading spinner and disable interaction */
  loading?: boolean;
  /** Make button take full width of container */
  fullWidth?: boolean;
  /** Icon element placed before the label */
  leftIcon?: ReactNode;
  /** Icon element placed after the label */
  rightIcon?: ReactNode;
  /** Ref is forwarded for form integration */
}
