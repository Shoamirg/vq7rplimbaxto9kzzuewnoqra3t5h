"use client";

import { ErrorState } from "@/components/states/error-state";
import { useI18n } from "@/lib/i18n/context";

export default function CustomersError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <ErrorState
      title={t("leaf.customers_error_title")}
      description={t("leaf.customers_error_desc")}
      onRetry={reset}
    />
  );
}
