"use client";

import { useI18n } from "@/lib/i18n/context";

import { ErrorState } from "@/components/states/error-state";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <ErrorState
      title={t("feedback.dashboard_error")}
      description={t("feedback.dashboard_error_description")}
      onRetry={reset}
    />
  );
}
