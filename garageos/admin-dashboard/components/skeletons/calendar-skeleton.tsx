import { Bar, Circle } from "./skel";

// Mirrors the Operations Board: toolbar, mechanic lane headers with an
// occupancy bar, a time gutter, and a few appointment-card placeholders
// scattered across the lanes so the grid reads as "a busy day, loading".

const LANES = 5;
const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];

// (laneIndex, topRem, heightRem) — a believable scatter of appointments.
const CARDS: Array<[number, number, number]> = [
  [1, 2, 3], [2, 2, 3], [3, 2, 3.5],
  [0, 6, 3], [2, 6.5, 2.5], [4, 5.5, 3.5],
  [1, 10.5, 3], [4, 10, 3], [0, 13.5, 3], [3, 13, 3.5],
];

function LaneHeaderSkel() {
  return (
    <div className="px-3 py-3 border-r border-border last:border-r-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Circle className="size-2.5" />
          <Bar className="h-3.5 w-24" />
        </div>
        <Bar className="h-3 w-8" />
      </div>
      <Bar className="mt-2 h-1.5 w-full rounded-full" />
    </div>
  );
}

function CardSkel({ heightRem }: { heightRem: number }) {
  return (
    <div
      className="absolute inset-x-1 rounded-lg border border-border bg-card p-2 space-y-1.5"
      style={{ height: `${heightRem}rem` }}
    >
      <Bar className="h-3 w-4/5" />
      <Bar className="h-2.5 w-3/5" />
      <Bar className="h-2.5 w-2/5" />
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="flex flex-col h-full" aria-busy="true" aria-label="Loading calendar">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 p-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Bar className="h-7 w-32" />
          <Bar className="h-4 w-12" />
        </div>
        <div className="flex items-center gap-2">
          <Bar className="h-9 w-40 rounded-lg" />
          <Bar className="h-9 w-20 rounded-lg" />
          <Bar className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Date sub-header */}
      <div className="px-4 lg:px-6 pb-3 flex items-center justify-between">
        <Bar className="h-4 w-48" />
        <Bar className="h-3 w-56 hidden md:block" />
      </div>

      {/* Board: gutter + lane columns */}
      <div className="flex-1 overflow-hidden border-t border-border">
        <div className="flex h-full">
          {/* Time gutter */}
          <div className="w-16 shrink-0 border-r border-border">
            <div className="h-13 border-b border-border" />
            {HOURS.map((h) => (
              <div key={h} className="h-14 px-2 pt-1 border-b border-border/60">
                <Bar className="h-2.5 w-9" />
              </div>
            ))}
          </div>

          {/* Lanes */}
          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${LANES}, minmax(0, 1fr))` }}>
            {Array.from({ length: LANES }).map((_, lane) => (
              <div key={lane} className="border-r border-border last:border-r-0">
                <LaneHeaderSkel />
                <div className="relative" style={{ height: `${HOURS.length * 3.5}rem` }}>
                  {/* Hour gridlines */}
                  {HOURS.map((_, i) => (
                    <div
                      key={i}
                      className="absolute inset-x-0 border-b border-border/50"
                      style={{ top: `${i * 3.5}rem`, height: "3.5rem" }}
                    />
                  ))}
                  {/* Appointment cards for this lane */}
                  {CARDS.filter(([l]) => l === lane).map(([, top, h], i) => (
                    <div key={i} className="absolute inset-x-0" style={{ top: `${top}rem` }}>
                      <CardSkel heightRem={h} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
