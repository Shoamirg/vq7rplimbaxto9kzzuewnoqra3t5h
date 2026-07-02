"use client";

import React, { useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  Bell,
  Moon,
  Sun,
  ChevronDown,
  LogOut,
  User,
  Settings,
  HelpCircle,
  MessageSquare,
} from "lucide-react";
import { cn, Avatar, Badge, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@garageos/design-system";
import { useTheme } from "../providers/theme-provider";
import { OPEN_EVENT } from "./command-menu";
import { NotificationBell } from "./notification-bell";

type ShellUser = { name: string; email: string; role: string | null };

function initials(name?: string): string {
  return (
    (name ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

// ─── Breadcrumbs ──────────────────────────────────────────────
// Human labels for the top-level segment. Deeper segments (ids) fall back to
// a title-cased slug so a detail route still reads sensibly.
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  calendar: "Calendar",
  appointments: "Appointments",
  vehicles: "Vehicles",
  customers: "Customers",
  inventory: "Inventory",
  reports: "Reports",
  settings: "Settings",
};

function labelFor(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Breadcrumbs() {
  const pathname = usePathname() ?? "/dashboard";
  // Only show the first segment — ids/sub-pages own their own in-page header.
  const first = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  return (
    <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">GarageOS</span>
      <ChevronDown className="size-3 -rotate-90 text-muted-foreground/50" />
      <span className="text-foreground font-medium">{labelFor(first)}</span>
    </nav>
  );
}

// ─── TopBar ───────────────────────────────────────────────────
export function TopBar({ user }: { user?: ShellUser }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const router = useRouter();

  const handleSignOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }, [router]);

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur-sm flex items-center justify-between gap-4 px-4 lg:px-6 shrink-0 sticky top-0 z-30">
      {/* Left: Breadcrumbs + Search */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <Breadcrumbs />

        {/* Global Search — opens the ⌘K command menu */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
          className="hidden sm:flex items-center gap-2 rounded-lg border border-border hover:border-muted-foreground/30 bg-muted/30 transition-colors flex-1 max-w-md text-left"
          aria-label="Open search"
        >
          <Search className="size-4 text-muted-foreground shrink-0 ml-3" />
          <span className="flex-1 text-sm text-muted-foreground/60 py-2.5 truncate">
            Search customers, vehicles, plate, VIN…
          </span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground mr-3">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
        >
          {resolvedTheme === "dark" ? (
            <Sun className="size-4 text-muted-foreground" />
          ) : (
            <Moon className="size-4 text-muted-foreground" />
          )}
        </button>

        {/* Notifications */}
        <NotificationBell />

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="User menu">
              <Avatar size="sm" fallback={initials(user?.name)} />
              <span className="hidden md:inline text-sm font-medium text-foreground">{user?.name ?? "Account"}</span>
              <ChevronDown className="size-3.5 text-muted-foreground hidden md:inline" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{user?.name ?? "Signed in"}</span>
                <span className="text-xs text-muted-foreground font-normal">{user?.email ?? ""}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<User className="size-4" />}>
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem icon={<Settings className="size-4" />}>
              Account Settings
            </DropdownMenuItem>
            <DropdownMenuItem icon={<MessageSquare className="size-4" />}>
              Messages
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<HelpCircle className="size-4" />}>
              Help & Support
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<LogOut className="size-4" />} destructive onClick={handleSignOut}>
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
