import type { HTMLAttributes, ReactNode } from "react";

export type SheetSide = "left" | "right" | "top" | "bottom";
export type SheetSize = "sm" | "md" | "lg" | "xl" | "full";

export interface SheetContentProps extends HTMLAttributes<HTMLDivElement> {
  /** Side to slide from */
  side?: SheetSide;
  /** Size (width for left/right, height for top/bottom) */
  size?: SheetSize;
  /** Hide close button */
  hideClose?: boolean;
  /** Children */
  children: ReactNode;
}

export interface SheetHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export interface SheetFooterProps extends HTMLAttributes<HTMLDivElement> {}

export interface SheetTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

export interface SheetDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}
