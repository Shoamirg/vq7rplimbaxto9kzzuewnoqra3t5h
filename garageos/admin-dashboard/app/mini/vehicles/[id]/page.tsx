"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, ExternalLink, Wrench } from "lucide-react";

import { useMiniData } from "@/lib/mini/hooks";
import { haptic } from "@/lib/mini/telegram";
import type { PassportResponse } from "@/lib/mini/types";
import { Card, Chip, HealthRing, ListSkeleton, ScreenError, SectionLabel, Skeleton, money } from "@/components/mini/ui";

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_TONE: Record<string, string> = { overdue: "red", due_soon: "amber", on_track: "green" };

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: p, loading, error, reload } = useMiniData<PassportResponse>(`/vehicles/${params.id}/passport`);

  const back = (
    <Link
      href="/mini/vehicles"
      onClick={() => haptic("light")}
      className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
    >
      <ArrowLeft className="size-4" aria-hidden /> Vehicles
    </Link>
  );

  if (error) return <div className="space-y-4">{back}<ScreenError message="Vehicle not found." onRetry={reload} /></div>;
  if (loading || !p) {
    return (
      <div className="space-y-5">
        {back}
        <Skeleton className="h-44 w-full rounded-3xl" />
        <ListSkeleton rows={3} />
      </div>
    );
  }

  const tier = p.health.score >= 90 ? "Gold" : p.health.score >= 75 ? "Silver" : p.health.score >= 60 ? "Bronze" : null;

  return (
    <div className="space-y-5">
      {back}

      {/* Passport hero — the differentiator, led with identity */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-amber-300" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                {tier ? `${tier} Certified` : "Certified"} Passport
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold leading-tight">
              {p.vehicle.brand} {p.vehicle.model}
            </h1>
            <p className="text-sm text-white/70">
              {[p.vehicle.year, p.vehicle.license_plate].filter(Boolean).join(" · ")}
            </p>
          </div>
          <HealthRing score={p.health.score} band={p.health.band} size={64} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Stat label="Mileage" value={p.vehicle.current_km ? `${(p.vehicle.current_km / 1000).toFixed(0)}k km` : "—"} />
          <Stat label="Compliance" value={`${p.health.compliance}%`} />
          <Stat label="Owned" value={`${p.vitals.ownership_years}y`} />
        </div>

        <div className="mt-4 font-mono text-[11px] tracking-widest text-white/50">{p.code}</div>
      </div>

      {/* Highlights */}
      <Card className="!p-2">
        <ul className="divide-y divide-slate-100">
          {p.highlights.map((h, i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-2.5">
              <BadgeCheck className={`size-5 ${h.ok ? "text-green-500" : "text-slate-300"}`} />
              <span className={`text-sm ${h.ok ? "text-slate-700" : "text-slate-400 line-through"}`}>{h.label}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Upcoming service */}
      {p.upcoming.length > 0 ? (
        <div>
          <SectionLabel>Upcoming service</SectionLabel>
          <Card className="!p-2">
            <ul className="divide-y divide-slate-100">
              {p.upcoming.map((u, i) => (
                <li key={i} className="flex items-center gap-3 px-2 py-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400">
                    <Wrench className="size-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{u.service_type}</p>
                    {u.remaining_km != null ? (
                      <p className="text-xs text-slate-400">in {u.remaining_km.toLocaleString()} km</p>
                    ) : null}
                  </div>
                  <Chip tone={STATUS_TONE[u.status] ?? "slate"}>{u.status.replace("_", " ")}</Chip>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {/* Recent service history */}
      {p.history.length > 0 ? (
        <div>
          <SectionLabel>Recent service</SectionLabel>
          <Card className="!p-2">
            <ul className="divide-y divide-slate-100">
              {p.history.map((h, i) => (
                <li key={i} className="flex items-center justify-between px-2 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{h.service_type}</p>
                    <p className="text-xs text-slate-400">{fmtDate(h.date)}</p>
                  </div>
                  {h.cost != null ? <span className="text-sm font-semibold text-slate-700">{money(h.cost)}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      <Link
        href={`/passport/${p.vehicle.id}`}
        onClick={() => haptic("light")}
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white transition motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
      >
        <ExternalLink className="size-4" aria-hidden /> View &amp; share full passport
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 py-2">
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-white/60">{label}</p>
    </div>
  );
}
