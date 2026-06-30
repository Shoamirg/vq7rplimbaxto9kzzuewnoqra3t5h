"use client";

import React, { forwardRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";
import type { SheetContentProps, SheetHeaderProps, SheetFooterProps } from "./sheet.types";

// ─── Root ─────────────────────────────────────────────────────
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

// ─── Overlay ──────────────────────────────────────────────────
export const SheetOverlay = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

// ─── Content variants ─────────────────────────────────────────
const sheetVariants = cva(
  "fixed z-50 gap-4 bg-card text-card-foreground shadow-xl border-border transition ease-in-out",
  {
    variants: {
      side: {
        left: "inset-y-0 left-0 h-full w-full border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right: "inset-y-0 right-0 h-full w-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        top: "inset-x-0 top-0 h-auto max-h-screen border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom: "inset-x-0 bottom-0 h-auto max-h-screen border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
      },
      size: {
        sm: "",
        md: "",
        lg: "",
        xl: "",
        full: "",
      },
    },
    compoundVariants: [
      { side: ["left", "right"], size: "sm", className: "sm:max-w-sm" },
      { side: ["left", "right"], size: "md", className: "sm:max-w-md" },
      { side: ["left", "right"], size: "lg", className: "sm:max-w-lg" },
      { side: ["left", "right"], size: "xl", className: "sm:max-w-xl" },
      { side: ["left", "right"], size: "full", className: "sm:max-w-[95vw]" },
      { side: ["top", "bottom"], size: "sm", className: "sm:max-h-[25vh]" },
      { side: ["top", "bottom"], size: "md", className: "sm:max-h-[33vh]" },
      { side: ["top", "bottom"], size: "lg", className: "sm:max-h-[50vh]" },
      { side: ["top", "bottom"], size: "xl", className: "sm:max-h-[75vh]" },
      { side: ["top", "bottom"], size: "full", className: "sm:max-h-[95vh]" },
    ],
    defaultVariants: {
      side: "right",
      size: "md",
    },
  }
);

// ─── Content ──────────────────────────────────────────────────
export const SheetContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, side = "right", size = "md", hideClose, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        sheetVariants({ side, size }),
        "data-[state=open]:animate-in data-[state=closed]:animate-out duration-300",
        className
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

// ─── Header ───────────────────────────────────────────────────
export const SheetHeader = forwardRef<HTMLDivElement, SheetHeaderProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-6 pb-0", className)}
      {...props}
    >
      {children}
    </div>
  )
);
SheetHeader.displayName = "SheetHeader";

// ─── Footer ───────────────────────────────────────────────────
export const SheetFooter = forwardRef<HTMLDivElement, SheetFooterProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col-reverse sm:flex-row gap-2 p-6 pt-0 mt-auto", className)}
      {...props}
    >
      {children}
    </div>
  )
);
SheetFooter.displayName = "SheetFooter";

// ─── Title ────────────────────────────────────────────────────
export const SheetTitle = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

// ─── Description ──────────────────────────────────────────────
export const SheetDescription = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";
