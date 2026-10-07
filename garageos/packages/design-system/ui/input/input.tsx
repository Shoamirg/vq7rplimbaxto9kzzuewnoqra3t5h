"use client";

import React, { forwardRef, useState, useCallback } from "react";
import { X, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "../../utils/cn";
import { InputRoot } from "./input-root";
import { InputLabel } from "./input-label";
import { InputField } from "./input-field";
import { InputPrefix } from "./input-prefix";
import { InputSuffix } from "./input-suffix";
import { InputHelper } from "./input-helper";
import type { InputProps } from "./input.types";

/**
 * Input component with layered architecture.
 *
 * Composes: InputRoot → InputLabel → InputField → [InputPrefix + <input> + InputSuffix] → InputHelper
 *
 * For complex layouts, import the sub-components directly:
 * ```tsx
 * <InputRoot>
 *   <InputLabel>Custom</InputLabel>
 *   <InputField>
 *     <InputPrefix><Search /></InputPrefix>
 *     <input className="flex-1 bg-transparent outline-hidden" />
 *   </InputField>
 * </InputRoot>
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      size = "md",
      invalid,
      success,
      leftIcon,
      rightIcon,
      clearable,
      loading,
      label,
      helperText,
      error,
      counter,
      disabled,
      value,
      defaultValue,
      onChange,
      type,
      ...props
    },
    ref
  ) => {
    const [focused, setFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [localValue, setLocalValue] = useState(defaultValue ?? "");

    const isControlled = value !== undefined;
    const currentValue = isControlled ? value : localValue;
    const hasValue = currentValue !== "" && currentValue !== undefined && currentValue !== null;

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!isControlled) setLocalValue(e.target.value);
        onChange?.(e);
      },
      [isControlled, onChange]
    );

    const handleClear = useCallback(() => {
      if (!isControlled) {
        setLocalValue("");
      } else if (onChange) {
        // For controlled inputs, fire onChange with empty value
        const syntheticEvent = {
          target: { value: "" },
          currentTarget: { value: "" },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
    }, [isControlled, onChange]);

    const isPassword = type === "password";
    const resolvedType = isPassword && showPassword ? "text" : type;

    // Error/success ring colors
    const ringColorClass = invalid
      ? "border-danger has-[input:focus]:border-danger has-[input:focus]:ring-danger/20"
      : success
        ? "border-success has-[input:focus]:border-success has-[input:focus]:ring-success/20"
        : "";



    return (
      <InputRoot size={size} invalid={invalid} disabled={disabled} className={className}>
        {label && <InputLabel required={props.required}>{label}</InputLabel>}

        <InputField
          size={size}
          invalid={invalid}
          focused={focused}
          disabled={disabled}
          className={ringColorClass}
        >
          {leftIcon && <InputPrefix size={size}>{leftIcon}</InputPrefix>}

          <input
            ref={ref}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            onFocus={(e) => {
              setFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              props.onBlur?.(e);
            }}
            disabled={disabled}
            type={resolvedType}
            className={cn(
              "peer flex-1 bg-transparent outline-hidden border-none p-0 m-0 h-full",
              "text-foreground placeholder:text-muted-foreground/60",
              "disabled:cursor-not-allowed",
              "[&::-ms-reveal]:hidden" // Hide Edge password toggle (we have our own)
            )}
            aria-invalid={invalid || undefined}
            aria-describedby={
              error
                ? `${props.id || props.name}-error`
                : helperText
                  ? `${props.id || props.name}-helper`
                  : undefined
            }
            {...props}
          />

          {/* Suffix icons */}
          <InputSuffix size={size}>
            {/* Clear button */}
            {clearable && hasValue && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center justify-center rounded-sm hover:text-foreground transition-colors"
                aria-label="Clear input"
                tabIndex={-1}
              >
                <X className="size-3.5" />
              </button>
            )}

            {/* Loading spinner */}
            {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}

            {/* Password visibility toggle */}
            {isPassword && (
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="inline-flex items-center justify-center rounded-sm hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            )}

            {/* Custom right icon */}
            {!loading && !isPassword && rightIcon}
          </InputSuffix>
        </InputField>

        {/* Helper/Error text + counter */}
        <div className="flex items-center justify-between gap-2">
          <InputHelper error={!!error}>
            {error || helperText}
          </InputHelper>
          {counter && (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {counter}
            </span>
          )}
        </div>
      </InputRoot>
    );
  }
);

Input.displayName = "Input";
