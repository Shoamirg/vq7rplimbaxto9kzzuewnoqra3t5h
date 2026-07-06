"use client";

import { useI18n } from "@/lib/i18n/context";
import { StaffRolesManager } from "@/components/settings/staff-roles-manager";
import { TeamManager } from "@/components/settings/team-manager";

// Settings home. Starts with the Team & Masters manager (the one settings
// surface needed to run a fresh garage); more sections land here over time.
export function SettingsScreen() {
  const { t } = useI18n();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.desc")}</p>
      </header>
      <StaffRolesManager />
      <TeamManager />
    </div>
  );
}
