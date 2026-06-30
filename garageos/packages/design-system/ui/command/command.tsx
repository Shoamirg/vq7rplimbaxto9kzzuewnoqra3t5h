"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  createContext,
  useContext,
  forwardRef,
  type KeyboardEvent,
} from "react";
import { Search, Command } from "lucide-react";
import { cn } from "../../utils/cn";
import { Dialog, DialogContent } from "../dialog";
import type {
  CommandPaletteProps,
  CommandGroupProps,
  CommandItemProps,
  CommandSeparatorProps,
  CommandEmptyProps,
} from "./command.types";

// ─── Context ──────────────────────────────────────────────────
interface CommandContextValue {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedIndex: number;
  totalItems: number;
  registerItem: () => number;
  onItemSelect: (index: number) => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

function useCommandContext() {
  const ctx = useContext(CommandContext);
  if (!ctx) throw new Error("Command components must be used within CommandPalette");
  return ctx;
}

// ─── Dialog state hook ────────────────────────────────────────
function useDialogState(defaultOpen = false) {
  const [open, setOpen] = useState(defaultOpen);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset search on close
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        setTimeout(() => setSearchQuery(""), 200);
      }
    },
    []
  );

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  return { open, searchQuery, setSearchQuery, handleOpenChange, inputRef };
}

// ─── Command Palette Root ─────────────────────────────────────
export function CommandPalette({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  placeholder = "Search commands, pages, and actions...",
  children,
  emptyMessage = "No results found.",
  triggerShortcut = "cmd+k",
  trigger,
  maxHeight = "400px",
}: CommandPaletteProps) {
  const isControlled = controlledOpen !== undefined;
  const dialogState = useDialogState(defaultOpen);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const totalItemsRef = useRef(0);
  const itemCounterRef = useRef(0);

  const open = isControlled ? controlledOpen : dialogState.open;
  const onOpenChange = isControlled ? controlledOnOpenChange! : dialogState.handleOpenChange;
  const searchQuery = isControlled ? dialogState.searchQuery : dialogState.searchQuery;
  const setSearchQuery = dialogState.setSearchQuery;

  // Register item and return index
  const registerItem = useCallback(() => {
    return itemCounterRef.current++;
  }, []);

  const onItemSelect = useCallback(
    (index: number) => {
      setSelectedIndex(index);
    },
    []
  );

  // Reset counter when children change
  useEffect(() => {
    itemCounterRef.current = 0;
  }, [children]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler as never);
    return () => window.removeEventListener("keydown", handler as never);
  }, [open, onOpenChange]);

  const contextValue = useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      selectedIndex,
      totalItems: totalItemsRef.current,
      registerItem,
      onItemSelect,
    }),
    [searchQuery, setSearchQuery, selectedIndex, registerItem, onItemSelect]
  );

  return (
    <>
      {/* Trigger */}
      {trigger ? (
        <div onClick={() => onOpenChange(true)}>{trigger}</div>
      ) : null}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          size="lg"
          className="p-0 gap-0 overflow-hidden top-[15%] translate-y-0"
          hideClose
        >
          <CommandContext.Provider value={contextValue}>
            {/* Search input */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={dialogState.inputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                aria-label="Search commands"
              />
              <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Command className="size-3" />
                K
              </kbd>
            </div>

            {/* Results */}
            <div
              className="overflow-y-auto p-1"
              style={{ maxHeight }}
              role="listbox"
              aria-label="Command results"
            >
              {children}
              {searchQuery && (
                <CommandEmpty>{emptyMessage}</CommandEmpty>
              )}
            </div>
          </CommandContext.Provider>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Command Group ────────────────────────────────────────────
export function CommandGroup({ label, children, icon, className }: CommandGroupProps & { className?: string }) {
  return (
    <div className={cn("mb-1", className)} role="group" aria-label={label}>
      {label && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {icon && <span className="size-3.5">{icon}</span>}
          {label}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

// ─── Command Item ─────────────────────────────────────────────
export const CommandItem = forwardRef<HTMLDivElement, CommandItemProps>(
  (
    { className, children, icon, shortcut, selected: _selected, value, keywords, onSelect, disabled, ...props },
    ref
  ) => {
    const ctx = useCommandContext();
    const itemIndex = ctx.registerItem();
    const isSelected = ctx.selectedIndex === itemIndex;
    const isVisible = !ctx.searchQuery || matchesSearch(value, ctx.searchQuery, keywords);

    if (!isVisible) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors",
          "aria-selected:bg-muted aria-selected:text-foreground",
          "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          disabled && "pointer-events-none opacity-50",
          isSelected ? "bg-muted text-foreground" : "text-muted-foreground",
          className
        )}
        role="option"
        aria-selected={isSelected || undefined}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled && onSelect) {
            onSelect();
          }
        }}
        {...props}
      >
        {icon && <span className="size-4 shrink-0">{icon}</span>}
        <span className="flex-1 text-foreground">{children}</span>
        {shortcut && (
          <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {shortcut}
          </kbd>
        )}
      </div>
    );
  }
);
CommandItem.displayName = "CommandItem";

// ─── Command Separator ────────────────────────────────────────
export const CommandSeparator = forwardRef<HTMLDivElement, CommandSeparatorProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("h-px bg-border my-1 mx-2", className)} {...props} />
  )
);
CommandSeparator.displayName = "CommandSeparator";

// ─── Command Empty ────────────────────────────────────────────
export function CommandEmpty({ children, className }: CommandEmptyProps & { className?: string }) {
  const ctx = useCommandContext();
  if (!ctx.searchQuery) return null;
  return (
    <div className={cn("py-8 text-center text-sm text-muted-foreground", className)}>
      {children}
    </div>
  );
}

// ─── Search matcher helper ────────────────────────────────────
function matchesSearch(value?: string, query?: string, keywords?: string[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (value?.toLowerCase().includes(q)) return true;
  if (keywords?.some((k) => k.toLowerCase().includes(q))) return true;
  return false;
}
