"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Gauge } from "lucide-react";

import { miniFetch } from "@/lib/mini/client";
import type { VehiclesResponse } from "@/lib/mini/types";
import { Card, EmptyState, HealthRing, Loading, ScreenHeader } from "@/components/mini/ui";

export default function VehiclesPage() {
  const [data, setData] = useState<VehiclesResponse | null>(null);

  useEffect(() => {
    miniFetch<VehiclesResponse>("/vehicles").then(setData).catch(() => setData({ vehicles: [] }));
  }, []);

  return (
    <div>
      <ScreenHeader title="My vehicles" />
      {!data ? (
        <Loading />
      ) : data.vehicles.length === 0 ? (
        <EmptyState icon={<Gauge className="size-8" />} title="No vehicles yet" note="Your garage will add them here." />
      ) : (
        <div className="space-y-3">
          {data.vehicles.map((v) => (
            <Card key={v.id} href={`/mini/vehicles/${v.id}`}>
              <div className="flex items-center gap-4">
                <HealthRing score={v.health_score} band={v.band} size={56} />
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">{v.label}</p>
                  <p className="text-sm text-slate-500">
                    {[v.year, v.plate, v.mileage ? `${v.mileage.toLocaleString()} km` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <ChevronRight className="size-5 text-slate-300" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
