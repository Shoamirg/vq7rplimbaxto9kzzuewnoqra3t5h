"use client";
import { VehicleSchematic } from "@/components/vehicles/vehicle-telemetry-blueprint";

import { ChevronRight, Gauge } from "lucide-react";

import { useMiniData } from "@/lib/mini/hooks";
import { useI18n } from "@/lib/i18n/context";
import type { VehiclesResponse } from "@/lib/mini/types";
import { Card, EmptyState, HealthRing, ListSkeleton, ScreenError, ScreenHeader } from "@/components/mini/ui";

export default function VehiclesPage() {
  const { data, loading, error, reload } = useMiniData<VehiclesResponse>("/vehicles");
  const { t, fmt } = useI18n();

  return (
    <div>
      <ScreenHeader title={t("mini.vehicles.title")} />
      {error ? (
        <ScreenError onRetry={reload} />
      ) : loading || !data ? (
        <ListSkeleton />
      ) : data.vehicles.length === 0 ? (
        <EmptyState
          icon={<Gauge className="size-8" />}
          title={t("mini.vehicles.empty")}
          note={t("mini.vehicles.empty_hint")}
        />
      ) : (
        <div className="space-y-3">
          {data.vehicles.map((v) => (
            <Card key={v.id} href={`/mini/vehicles/${v.id}`}><div className="rounded-tile mb-3" style={{ background: "var(--hero-stage)" }}><VehicleSchematic /></div>
              <div className="flex items-center gap-4">
                <HealthRing score={v.health_score} band={v.band} size={56} />
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{v.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {[v.year, v.plate, v.mileage ? `${fmt.number(v.mileage)} ${t("mini.unit.km")}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <ChevronRight className="size-5 text-slate-300" aria-hidden />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
