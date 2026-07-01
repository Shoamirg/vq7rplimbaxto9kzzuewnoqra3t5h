"use client";

import { ErrorState } from "@/components/states/error-state";

export default function VehicleError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="This vehicle's health report couldn't load"
      description="We couldn't fetch the maintenance history and health score for this vehicle. Retry, or check your connection — the record itself is safe."
      onRetry={reset}
    />
  );
}
