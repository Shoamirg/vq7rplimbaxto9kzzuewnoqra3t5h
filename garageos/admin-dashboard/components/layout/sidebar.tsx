"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Wrench,
  Car,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  Bell,
  LogOut,
  User,
  HelpCircle,
  BarChart3,
  FileText,
  Warehouse,
  Siren,
} from "lucide-react";
import { cn } from "@garageos/design-system";

// ─── Navigation Items ─────────────────────────────────────────
interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string | number;
}

const mainNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="size-5" /> },
  { label: "Calendar", href: "/calendar", icon: <Calendar className="size-5" /> },
  { label: "Appointments", href: "/appointments", icon: <Wrench className="size-5" /> },
  { label: "Vehicles", href: "/vehicles", icon: <Car className="size-5" /> },
  { label: "Customers", href: "/customers", icon: <Users className="size-5" /> },
  { label: "Operations", href: "/operations", icon: <Siren className="size-5" /> },
  { label: "Inventory", href: "/inventory", icon: <Warehouse className="size-5" /> },
  { label: "Reports", href: "/reports", icon: <BarChart3 className="size-5" /> },
];

const bottomNav: NavItem[] = [
  { label: "Settings", href: "/settings", icon: <Settings className="size-5" /> },
  { label: "Help & Support", href: "/support", icon: <HelpCircle className="size-5" /> },
];

type ShellUser = { name: string; email: string; role: string | null };
type Brand = { name: string; monogram: string; tagline: string | null } | null;

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

// ─── Sidebar Component ────────────────────────────────────────
export function Sidebar({ user, branding }: { user?: ShellUser; branding?: Brand }) {
  const brandName = branding?.name ?? "GarageOS";
  const brandMono = branding?.monogram ?? "G";
  const brandTagline = branding?.tagline ?? "Admin Panel";
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname?.startsWith(href);
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile hamburger (visible on small screens outside sidebar) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-30 lg:hidden p-2 rounded-lg bg-background border border-border shadow-sm"
        aria-label="Open sidebar"
      >
        <ChevronRight className="size-5" />
      </button>

      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-300",
          collapsed ? "w-16" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "h-16 flex items-center border-b border-sidebar-muted shrink-0",
          collapsed ? "justify-center px-0" : "px-4 gap-3"
        )}>
          <div className="size-9 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-primary-foreground font-bold text-sm">{brandMono}</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sidebar-foreground text-sm leading-tight truncate">{brandName}</span>
              <span className="text-[10px] text-sidebar-foreground/50 leading-tight truncate">{brandTagline}</span>
            </div>
          )}
        </div>

        {/* Quick Action */}
        <div className={cn("p-3", collapsed && "px-2")}>
          <button
            className={cn(
              "flex items-center gap-2 w-full rounded-lg font-medium transition-all duration-150",
              "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 shadow-sm",
              collapsed
                ? "justify-center h-10 w-10 mx-auto"
                : "px-4 py-2.5 text-sm"
            )}
            aria-label="Create new"
          >
            <Plus className="size-4 shrink-0" />
            {!collapsed && <span>New Appointment</span>}
          </button>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-0.5">
          {mainNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 group",
                  collapsed ? "justify-center h-11 w-11 mx-auto" : "px-3 py-2.5",
                  active
                    ? "bg-sidebar-active/15 text-sidebar-active"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-muted/50"
                )}
              >
                <span className={cn(
                  "shrink-0",
                  active ? "text-sidebar-active" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70"
                )}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-sidebar-active/20 text-sidebar-active text-[10px] font-semibold">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="px-3 py-2 border-t border-sidebar-muted space-y-0.5">
          {bottomNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 group",
                  collapsed ? "justify-center h-11 w-11 mx-auto" : "px-3 py-2.5",
                  active
                    ? "bg-sidebar-active/15 text-sidebar-active"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-muted/50"
                )}
              >
                <span className={cn(
                  "shrink-0",
                  active ? "text-sidebar-active" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70"
                )}>
                  {item.icon}
                </span>
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              </Link>
            );
          })}

          {/* Collapse toggle */}
          <button
            onClick={toggle}
            className={cn(
              "flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 w-full group",
              collapsed ? "justify-center h-11 w-11 mx-auto" : "px-3 py-2.5",
              "text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-muted/50"
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft className={cn(
              "size-4 shrink-0 transition-transform duration-300",
              collapsed && "rotate-180"
            )} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>

        {/* User Mini-Profile */}
        {!collapsed && (
          <div className="border-t border-sidebar-muted p-3 flex items-center gap-3">
            <div className="size-9 rounded-full bg-sidebar-muted flex items-center justify-center text-sm font-medium text-sidebar-foreground shrink-0">
              {initials(user?.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name ?? "Signed in"}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email ?? ""}</p>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
