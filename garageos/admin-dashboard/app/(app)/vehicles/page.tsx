import Link from "next/link";
import { redirect } from "next/navigation";
import { Car, ChevronRight, Gauge } from "lucide-react";

import { ApiError, getVehicles } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  let data;
  try {
    data = await getVehicles();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/login");
    throw err;
  }

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Vehicles</h1>
        <p className="text-sm text-muted-foreground mt-1">{data.count} vehicles · open one to view its health report.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {data.items.map((v) => (
          <Link
            key={v.id}
            href={`/vehicles/${v.id}`}
            className="group rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <Car className="size-5" />
              </div>
              <Gauge className="size-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground truncate">
              {v.brand} {v.model}
            </p>
            <p className="text-xs text-muted-foreground">
              {v.year} · {v.current_km.toLocaleString("en-US")} km
            </p>
            <div className="mt-2 flex items-center justify-between">
              {v.license_plate ? (
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{v.license_plate}</span>
              ) : <span />}
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                Health <ChevronRight className="size-3.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
