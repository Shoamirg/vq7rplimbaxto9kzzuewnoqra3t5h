import type {
  ReactNode,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  HTMLAttributes,
} from "react";

// ─── Size variants ───────────────────────────────────────────
export type InputSize = "sm" | "md" | "lg";

// ─── Root ─────────────────────────────────────────────────────
export interface InputRootProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual size, affects all children */
  size?: InputSize;
  /** Whether the field is in an error state */
  invalid?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
}

// ─── Label ────────────────────────────────────────────────────
export interface InputLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Whether the field is required (shows asterisk) */
  required?: boolean;
}

// ─── Field container ──────────────────────────────────────────
export interface InputFieldProps extends HTMLAttributes<HTMLDivElement> {
  /** Focus state is forwarded from the input */
  focused?: boolean;
  /** Error state */
  invalid?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Size variant */
  size?: InputSize;
}

// ─── The actual <input> element ───────────────────────────────
export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Size variant */
  size?: InputSize;
  /** Show error styling */
  invalid?: boolean;
  /** Show success styling */
  success?: boolean;
  /** Prefix icon element */
  leftIcon?: ReactNode;
  /** Suffix icon element */
  rightIcon?: ReactNode;
  /** Show clear button when value is present */
  clearable?: boolean;
  /** Show loading indicator */
  loading?: boolean;
  /** Label text */
  label?: string;
  /** Helper text shown below the input */
  helperText?: string;
  /** Error message shown below the input (replaces helper text) */
  error?: string;
  /** Character counter suffix (e.g. "0/100") */
  counter?: string;
}

// ─── Sub-components ───────────────────────────────────────────
export interface InputPrefixProps extends HTMLAttributes<HTMLSpanElement> {
  /** Size variant */
  size?: InputSize;
}

export interface InputSuffixProps extends HTMLAttributes<HTMLSpanElement> {
  /** Size variant */
  size?: InputSize;
}

export interface InputHelperProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Error state changes color to danger */
  error?: boolean;
}
