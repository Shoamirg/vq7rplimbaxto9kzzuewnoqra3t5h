"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@garageos/design-system";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6 grid place-items-center min-h-[60vh]">
      <div className="text-center space-y-3 max-w-sm">
        <div className="mx-auto size-12 rounded-full bg-danger/10 text-danger grid place-items-center">
          <AlertTriangle className="size-6" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Couldn&apos;t load the dashboard</h2>
        <p className="text-sm text-muted-foreground">
          The backend may be unavailable. Check that the API is running, then retry.
        </p>
        <Button onClick={reset}>Retry</Button>
      </div>
    </div>
  );
}
