"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Car, CreditCard, Home, MessageSquare, User } from "lucide-react";

import { haptic } from "@/lib/mini/telegram";
import { useI18n } from "@/lib/i18n/context";

const TABS = [
  { href: "/mini", labelKey: "mini.tab.home", icon: Home, exact: true },
  { href: "/mini/vehicles", labelKey: "mini.tab.vehicles", icon: Car },
  { href: "/mini/messages", labelKey: "mini.tab.messages", icon: MessageSquare },
  { href: "/mini/billing", labelKey: "mini.tab.billing", icon: CreditCard },
  { href: "/mini/me", labelKey: "mini.tab.me", icon: User },
];

export function TabBar() {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-slate-200/80 bg-white/85 backdrop-blur-xl"
    >
      <ul className="flex items-stretch justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                onClick={() => haptic("selection")}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active ? "text-blue-600" : "text-slate-600"
                }`}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                {t(tab.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
