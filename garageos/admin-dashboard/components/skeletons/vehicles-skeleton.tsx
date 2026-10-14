"use client";

import { useI18n } from "@/lib/i18n/context";
import { Bar, CardShell } from "./skel";

// Mirrors the vehicles grid: title + a responsive grid of vehicle cards
// (icon chip, name, year·km, plate + health link).

function VehicleCardSkel() {
  return (
    <CardShell className="p-4">
      <div className="flex items-start justify-between">
        <Bar className="size-11 rounded-xl" />
        <Bar className="size-5 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <Bar className="h-4 w-32" />
        <Bar className="h-3 w-24" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Bar className="h-5 w-16 rounded-md" />
        <Bar className="h-3 w-14" />
      </div>
    </CardShell>
  );
}

export function VehiclesSkeleton() {
  const { t } = useI18n();
  return (
    <div className="p-4 lg:p-6 space-y-6" role="status" aria-busy="true" aria-label={t("feedback.loading_vehicles")}>
      <div className="space-y-2">
        <Bar className="h-7 w-40" />
        <Bar className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => <VehicleCardSkel key={i} />)}
      </div>
    </div>
  );
}
