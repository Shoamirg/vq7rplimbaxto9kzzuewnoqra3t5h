"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Car, CreditCard, Home, MessageSquare, User } from "lucide-react";

const TABS = [
  { href: "/mini", label: "Home", icon: Home, exact: true },
  { href: "/mini/vehicles", label: "Vehicles", icon: Car },
  { href: "/mini/messages", label: "Messages", icon: MessageSquare },
  { href: "/mini/billing", label: "Billing", icon: CreditCard },
  { href: "/mini/me", label: "Me", icon: User },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-slate-200/80 bg-white/85 backdrop-blur-xl">
      <ul className="flex items-stretch justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-1 rounded-xl py-1 text-[10px] font-medium transition ${
                  active ? "text-blue-600" : "text-slate-400"
                }`}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 1.9} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
