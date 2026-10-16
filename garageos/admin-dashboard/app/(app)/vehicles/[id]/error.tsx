"use client";

import { useI18n } from "@/lib/i18n/context";
import { ErrorState } from "@/components/states/error-state";

export default function VehicleError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <ErrorState
      title={t("crm.vehicle_failed")}
      description={t("common.load_failed")}
      onRetry={reset}
    />
  );
}
