"use client";

import { BarChart3, HelpCircle, Inbox, Settings, Warehouse, type LucideIcon } from "lucide-react";
import { Badge } from "@garageos/design-system";

import { EmptyState } from "./empty-state";
import { useI18n } from "@/lib/i18n/context";

// Icons are resolved by name here (client-side): a Server Component page cannot
// pass a component/function across the server→client boundary.
const ICONS: Record<string, LucideIcon> = {
  inventory: Warehouse,
  reports: BarChart3,
  settings: Settings,
  support: HelpCircle,
  inbox: Inbox,
};

// A polished placeholder for routes that exist in the nav but aren't built yet —
// so they never 404. Translated, on-brand, with a way back.
export function ComingSoon({
  icon,
  titleKey,
  descKey,
}: {
  icon: keyof typeof ICONS;
  titleKey: string;
  descKey: string;
}) {
  const { t } = useI18n();
  const Icon = ICONS[icon] ?? Warehouse;
  return (
    <div className="p-4 lg:p-8 h-full">
      <div className="mx-auto max-w-2xl">
        <div className="mb-3 flex justify-center">
          <Badge variant="primary" size="sm">{t("soon.badge")}</Badge>
        </div>
        <div className="rounded-2xl border border-border bg-card">
          <EmptyState
            titleAs="h1"
            icon={Icon}
            title={t(titleKey)}
            description={t(descKey)}
            action={{ label: t("action.back_dashboard"), href: "/dashboard" }}
          />
        </div>
      </div>
    </div>
  );
}
