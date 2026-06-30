"use client";

import React, { useState, useCallback } from "react";
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

// ─── Breadcrumbs ──────────────────────────────────────────────
function Breadcrumbs() {
  // In a real app, this would derive from the route or a context
  return (
    <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">GarageOS</span>
      <ChevronDown className="size-3 -rotate-90 text-muted-foreground/50" />
      <span className="text-foreground font-medium">Dashboard</span>
    </nav>
  );
}

// ─── TopBar ───────────────────────────────────────────────────
export function TopBar() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      // In a real app, this would navigate to search results or open command palette
    },
    []
  );

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur-sm flex items-center justify-between gap-4 px-4 lg:px-6 shrink-0 sticky top-0 z-30">
      {/* Left: Breadcrumbs + Search */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <Breadcrumbs />

        {/* Global Search */}
        <form
          onSubmit={handleSearch}
          className={cn(
            "hidden sm:flex items-center gap-2 rounded-lg border transition-all duration-200 flex-1 max-w-md",
            searchFocused
              ? "border-ring ring-2 ring-ring/20"
              : "border-border hover:border-muted-foreground/30",
            "bg-muted/30"
          )}
        >
          <Search className="size-4 text-muted-foreground shrink-0 ml-3" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search customers, VIN, appointments... (⌘K)"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none py-2.5 pr-3 min-w-0"
            aria-label="Global search"
          />
        </form>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="relative p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Notifications"
            >
              <Bell className="size-4 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80" maxHeight="400px">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Bell className="size-8 mx-auto mb-2 opacity-40" />
              <p>No new notifications</p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="User menu">
              <Avatar size="sm" fallback="JD" />
              <span className="hidden md:inline text-sm font-medium text-foreground">John Doe</span>
              <ChevronDown className="size-3.5 text-muted-foreground hidden md:inline" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">John Doe</span>
                <span className="text-xs text-muted-foreground font-normal">john@garageos.com</span>
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
            <DropdownMenuItem icon={<LogOut className="size-4" />} destructive>
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
