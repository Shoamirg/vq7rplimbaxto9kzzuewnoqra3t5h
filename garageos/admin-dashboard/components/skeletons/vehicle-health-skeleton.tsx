import { Bar, Ring, CardShell } from "./skel";

// Mirrors VehicleHealthScreen: breadcrumb, header card + passport/QR, tab row,
// gauge + trend + at-a-glance, then the category mini-gauge row.

function CategoryGaugeSkel() {
  return (
    <CardShell className="flex flex-col items-center gap-2 p-4">
      <Ring size={64} stroke={6} />
      <Bar className="h-3 w-16" />
      <Bar className="h-2.5 w-12" />
    </CardShell>
  );
}

export function VehicleHealthSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-5" aria-busy="true" aria-label="Loading vehicle health">
      <Bar className="h-4 w-56" />

      {/* Header card + Digital Passport */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <CardShell className="xl:col-span-2">
          <div className="flex items-center gap-4">
            <Bar className="size-14 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3">
                <Bar className="h-5 w-40" />
                <Bar className="h-5 w-20 rounded-full" />
              </div>
              <Bar className="h-3 w-72 max-w-full" />
            </div>
            <div className="hidden sm:flex gap-2">
              <Bar className="h-9 w-28 rounded-lg" />
              <Bar className="h-9 w-28 rounded-lg" />
            </div>
          </div>
        </CardShell>
        <CardShell className="flex items-center justify-between">
          <div className="space-y-2">
            <Bar className="h-4 w-40" />
            <Bar className="h-3 w-36" />
            <Bar className="h-8 w-32 rounded-lg mt-3" />
          </div>
          <Bar className="size-20 rounded-lg" />
        </CardShell>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-border pb-1">
        {["w-16", "w-16", "w-28", "w-20", "w-14"].map((w, i) => (
          <Bar key={i} className={`h-4 ${w}`} />
        ))}
      </div>

      {/* Gauge + Trend + At a Glance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardShell>
          <Bar className="h-4 w-40" />
          <div className="flex flex-col items-center py-6">
            <Ring size={160} stroke={14} />
            <Bar className="mt-4 h-4 w-20" />
            <Bar className="mt-3 h-3 w-52 max-w-full" />
          </div>
        </CardShell>

        <CardShell>
          <Bar className="h-4 w-28" />
          <div className="mt-6 h-40 flex items-end">
            {/* A rising trend area */}
            <div className="w-full h-24 rounded-md bg-muted/70 animate-pulse" />
          </div>
          <div className="mt-3 flex gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Bar key={i} className="h-2 flex-1" />)}
          </div>
        </CardShell>

        <CardShell>
          <Bar className="h-4 w-28" />
          <div className="mt-4 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Bar className="size-9 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Bar className="h-3.5 w-12" />
                  <Bar className="h-2.5 w-28" />
                </div>
              </div>
            ))}
          </div>
        </CardShell>
      </div>

      {/* Category Health */}
      <CardShell>
        <Bar className="h-4 w-36" />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <CategoryGaugeSkel key={i} />)}
        </div>
      </CardShell>
    </div>
  );
}
