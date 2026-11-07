"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Disclosure behaviour for the phone/tablet navigation menu: Escape closes and
 * returns focus to the toggle, a tap outside closes, widening to the desktop
 * layout closes, and opening moves focus to the first item.
 */
export function useMobileMenu(desktopQuery: string) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const desktop = window.matchMedia(desktopQuery);
    const onResize = () => { if (desktop.matches) setOpen(false); };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    desktop.addEventListener("change", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      desktop.removeEventListener("change", onResize);
    };
  }, [open, desktopQuery]);

  return { open, toggle, close, buttonRef, panelRef };
}
