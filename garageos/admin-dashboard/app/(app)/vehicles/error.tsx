"use client";

import { ErrorState } from "@/components/states/error-state";

export default function VehiclesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="The vehicle list couldn't load"
      description="We couldn't fetch your fleet just now. Retry, or check your connection — your vehicles are safe."
      onRetry={reset}
    />
  );
}
