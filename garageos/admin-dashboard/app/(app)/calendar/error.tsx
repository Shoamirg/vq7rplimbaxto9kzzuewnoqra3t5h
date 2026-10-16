"use client";

import { useI18n } from "@/lib/i18n/context";

import { ErrorState } from "@/components/states/error-state";

export default function CalendarError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <ErrorState
      title={t("feedback.calendar_error")}
      description={t("feedback.calendar_error_description")}
      onRetry={reset}
    />
  );
}
