"use client";

import { ErrorState } from "@/components/states/error-state";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="The dashboard couldn't load"
      description="We couldn't reach the API to pull today's stats and fleet health. This is usually temporary — retry, or check that the backend is running."
      onRetry={reset}
    />
  );
}
