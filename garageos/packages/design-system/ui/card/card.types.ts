import type { HTMLAttributes, ReactNode, ForwardRefExoticComponent, RefAttributes } from "react";

export type CardVariant = "default" | "outline" | "elevated" | "muted";
export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual style variant */
  variant?: CardVariant;
  /** Inner padding */
  padding?: CardPadding;
  /** Show skeleton loading state */
  loading?: boolean;
  /** Show empty state */
  empty?: boolean;
  /** Custom empty state message */
  emptyMessage?: string;
  /** Custom empty state action */
  emptyAction?: ReactNode;
  /** Click handler for interactive cards */
  onClick?: () => void;
}

export interface CardComponent
  extends ForwardRefExoticComponent<CardProps & RefAttributes<HTMLDivElement>> {
  Header: ForwardRefExoticComponent<CardHeaderProps & RefAttributes<HTMLDivElement>>;
  Title: ForwardRefExoticComponent<HTMLAttributes<HTMLHeadingElement> & RefAttributes<HTMLHeadingElement>>;
  Description: ForwardRefExoticComponent<HTMLAttributes<HTMLParagraphElement> & RefAttributes<HTMLParagraphElement>>;
  Content: ForwardRefExoticComponent<CardContentProps & RefAttributes<HTMLDivElement>>;
  Footer: ForwardRefExoticComponent<CardFooterProps & RefAttributes<HTMLDivElement>>;
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding override */
  padding?: CardPadding;
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding override */
  padding?: CardPadding;
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding override */
  padding?: CardPadding;
}
