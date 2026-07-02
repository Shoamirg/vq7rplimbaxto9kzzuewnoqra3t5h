"use client";

import { ErrorState } from "@/components/states/error-state";

export default function CustomersError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Customers couldn't load"
      description="We couldn't reach the API to load your customers. Retry, or check your connection — nothing was changed."
      onRetry={reset}
    />
  );
}
