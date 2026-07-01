"use client";

import { ErrorState } from "@/components/states/error-state";

export default function CalendarError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="The calendar couldn't load"
      description="We couldn't pull the schedule, mechanics, and appointments for this range. Retry, or check that the API is reachable — nothing was changed."
      onRetry={reset}
    />
  );
}
