"use client";

import { Bar, Ring, CardShell } from "./skel";
import { useI18n } from "@/lib/i18n/context";

// Mirrors DashboardClient: header, 4 KPI cards, Fleet Health gauge + revenue
// chart, then today's appointments + due-for-service lists.

function KpiCardSkel() {
  return (
    <CardShell className="p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Bar className="h-3 w-28" />
          <Bar className="h-7 w-14" />
          <Bar className="h-3 w-20" />
        </div>
        <Bar className="size-10 rounded-xl" />
      </div>
    </CardShell>
  );
}

function ListRowSkel() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <Bar className="h-3 w-10 shrink-0" />
      <div className="size-9 rounded-full bg-muted/70 animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Bar className="h-3 w-1/3" />
        <Bar className="h-2.5 w-1/2" />
      </div>
      <Bar className="h-5 w-16 rounded-full" />
    </div>
  );
}

export function DashboardSkeleton() {
  const { t } = useI18n();
  return (
    <div className="p-4 lg:p-6 space-y-6" aria-busy="true" aria-label={t("leaf.loading_dashboard")}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Bar className="h-7 w-40" />
          <Bar className="h-4 w-80 max-w-full" />
        </div>
        <div className="hidden sm:flex gap-2">
          <Bar className="h-8 w-24 rounded-lg" />
          <Bar className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <KpiCardSkel key={i} />)}
      </div>

      {/* Fleet Health gauge + Weekly Revenue chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardShell className="lg:col-span-1">
          <Bar className="h-4 w-28" />
          <Bar className="mt-2 h-3 w-40" />
          <div className="flex flex-col items-center py-4">
            <Ring size={148} />
            <Bar className="mt-3 h-4 w-16" />
            <div className="w-full mt-5 space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Bar className="h-2.5 w-16" />
                  <Bar className="h-2 flex-1" />
                  <Bar className="h-2.5 w-6" />
                </div>
              ))}
            </div>
          </div>
        </CardShell>

        <CardShell className="lg:col-span-2">
          <Bar className="h-4 w-32" />
          <Bar className="mt-2 h-3 w-56" />
          {/* Chart plot: rising bars against an axis */}
          <div className="mt-6 flex items-end gap-3 h-56">
            {[45, 62, 40, 74, 90, 58, 48].map((h, i) => (
              <div key={i} className="flex-1 flex items-end h-full">
                <Bar className="w-full rounded-t-md" style={{ height: `${h}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-3">
            {Array.from({ length: 7 }).map((_, i) => <Bar key={i} className="h-2 flex-1" />)}
          </div>
        </CardShell>
      </div>

      {/* Today's appointments + Due for service */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardShell className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Bar className="h-4 w-40" />
              <Bar className="h-3 w-28" />
            </div>
            <Bar className="h-8 w-24 rounded-lg" />
          </div>
          <div className="mt-3">
            {Array.from({ length: 4 }).map((_, i) => <ListRowSkel key={i} />)}
          </div>
        </CardShell>
        <CardShell>
          <Bar className="h-4 w-32" />
          <Bar className="mt-2 h-3 w-40" />
          <div className="mt-3">
            {Array.from({ length: 3 }).map((_, i) => <ListRowSkel key={i} />)}
          </div>
        </CardShell>
      </div>
    </div>
  );
}
