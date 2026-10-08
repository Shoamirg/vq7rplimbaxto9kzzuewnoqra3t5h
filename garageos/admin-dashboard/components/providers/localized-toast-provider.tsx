"use client";

import { ToastProvider } from "@garageos/design-system";
import { useI18n } from "@/lib/i18n/context";

export function LocalizedToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return <ToastProvider position="bottom-right" label={t("menu.notifications")}>{children}</ToastProvider>;
}
