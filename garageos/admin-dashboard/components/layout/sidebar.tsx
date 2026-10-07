"use client";

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  User,
  HelpCircle,
  BarChart3,
  Warehouse,
  Siren,
  Inbox,
  Receipt,
  X,
} from "lucide-react";
import { cn } from "@garageos/design-system";

import { useI18n } from "@/lib/i18n/context";
import { NewAppointmentModal } from "@/components/appointments/new-appointment-modal";

// ─── Navigation ───────────────────────────────────────────────
// Grouped into labelled sections so the rail reads by intent, not as one long
// flat list. Labels are i18n keys resolved at render time.
interface NavItem {
  key: string; // nav.* translation key
  href: string;
  icon: React.ReactNode;
  badge?: string | number;
  unfinished?: boolean;
}
interface NavSection {
  key: string; // section.* translation key
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    key: "section.workspace",
    items: [
      { key: "nav.dashboard", href: "/dashboard", icon: <LayoutDashboard className="size-5" /> },
      { key: "nav.calendar", href: "/calendar", icon: <Calendar className="size-5" /> },
      { key: "nav.appointments", href: "/appointments", icon: <Wrench className="size-5" /> },
    ],
  },
  {
    key: "section.crm",
    items: [
      { key: "nav.customers", href: "/customers", icon: <Users className="size-5" /> },
      { key: "nav.vehicles", href: "/vehicles", icon: <Car className="size-5" /> },
    ],
  },
  {
    key: "section.operations",
    items: [
      { key: "nav.inbox", href: "/inbox", icon: <Inbox className="size-5" /> },
      { key: "nav.operations", href: "/operations", icon: <Siren className="size-5" /> },
    ],
  },
  {
    key: "section.business",
    items: [
      { key: "nav.billing", href: "/billing", icon: <Receipt className="size-5" /> },
      { key: "nav.inventory", href: "/inventory", icon: <Warehouse className="size-5" />, unfinished: true },
      { key: "nav.reports", href: "/reports", icon: <BarChart3 className="size-5" /> },
    ],
  },
];

const bottomNav: NavItem[] = [
  { key: "nav.settings", href: "/settings", icon: <Settings className="size-5" /> },
  { key: "nav.support", href: "/support", icon: <HelpCircle className="size-5" />, unfinished: true },
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
  const { t } = useI18n();
  const brandName = branding?.name ?? "GarageOS";
  const brandMono = branding?.monogram ?? "G";
  const brandTagline = branding?.tagline ?? t("brand.tagline");
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);

  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileOpen]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname?.startsWith(href);
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          aria-label={t("action.close_menu")}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile hamburger (visible on small screens outside sidebar) */}
      <button
        onClick={() => setMobileOpen(true)}
        className={cn("fixed top-3 left-3 z-40 lg:hidden p-2 rounded-lg bg-background border border-border shadow-xs", mobileOpen && "hidden")}
        aria-label={t("action.open_menu")}
        aria-expanded={mobileOpen}
        aria-controls="staff-sidebar"
        data-testid="sidebar-open"
      >
        <ChevronRight className="size-5" />
      </button>

      <aside
        id="staff-sidebar"
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
          <button onClick={() => setMobileOpen(false)} aria-label={t("action.close_menu")} className="lg:hidden p-2 ml-auto"><X className="size-4" /></button>
          <div className="size-9 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-xs">
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
              "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 shadow-xs",
              collapsed
                ? "justify-center h-10 w-10 mx-auto"
                : "px-4 py-2.5 text-sm"
            )}
            aria-label={t("action.new_appointment")}
            onClick={() => { setMobileOpen(false); setApptOpen(true); }}
          >
            <Plus className="size-4 shrink-0" />
            {!collapsed && <span>{t("action.new_appointment")}</span>}
          </button>
        </div>
        {apptOpen && (
          <NewAppointmentModal
            onClose={() => setApptOpen(false)}
            onCreated={() => { setApptOpen(false); setMobileOpen(false); router.push("/appointments"); }}
          />
        )}

        {/* Main Navigation — grouped sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
          {NAV_SECTIONS.map((section) => (
            <div key={section.key} className="space-y-0.5">
              {!collapsed && (
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {t(section.key)}
                </p>
              )}
              {collapsed && <div className="my-2 mx-2 border-t border-sidebar-muted/60" />}
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    aria-label={t(item.key) + (item.unfinished ? " · " + t("soon.badge") : "")}
                    title={collapsed ? t(item.key) + (item.unfinished ? " · " + t("soon.badge") : "") : undefined}
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
                        <span className="flex-1 truncate">{t(item.key)}</span>
                        {item.unfinished && <span className="text-[9px] text-sidebar-foreground/50">{t("soon.badge")}</span>}
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
            </div>
          ))}
        </nav>

        {/* Bottom Navigation */}
        <div className="px-3 py-2 border-t border-sidebar-muted space-y-0.5">
          {bottomNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                aria-label={t(item.key) + (item.unfinished ? " · " + t("soon.badge") : "")}
                title={collapsed ? t(item.key) + (item.unfinished ? " · " + t("soon.badge") : "") : undefined}
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
                {!collapsed && <span className="flex-1 truncate">{t(item.key)}</span>}
                {!collapsed && item.unfinished && <span className="text-[9px] text-sidebar-foreground/50">{t("soon.badge")}</span>}
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
            aria-label={collapsed ? t("action.expand") : t("action.collapse")}
          >
            <ChevronLeft className={cn(
              "size-4 shrink-0 transition-transform duration-300",
              collapsed && "rotate-180"
            )} />
            {!collapsed && <span>{t("action.collapse")}</span>}
          </button>
        </div>

        {/* User Mini-Profile */}
        {!collapsed && (
          <div className="border-t border-sidebar-muted p-3 flex items-center gap-3">
            <div className="size-9 rounded-full bg-sidebar-muted flex items-center justify-center text-sm font-medium text-sidebar-foreground shrink-0">
              {initials(user?.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name ?? t("menu.signed_in")}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email ?? ""}</p>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
