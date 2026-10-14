import type { ReactNode, HTMLAttributes } from "react";
import type { DialogProps as RadixDialogProps, DialogContentProps as RadixContentProps } from "@radix-ui/react-dialog";

export type DialogSize = "sm" | "md" | "lg" | "xl" | "full";

export interface DialogRootProps extends RadixDialogProps {
  /** Size of the dialog */
  size?: DialogSize;
}

export interface DialogContentProps extends RadixContentProps {
  /** Hide default close X button */
  hideClose?: boolean;
  /** Size override */
  size?: DialogSize;
  /** Remove padding */
  noPadding?: boolean;
}

export interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export interface DialogFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** Right-align actions */
  align?: "left" | "center" | "right";
}

export interface DialogTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

export interface DialogDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}
