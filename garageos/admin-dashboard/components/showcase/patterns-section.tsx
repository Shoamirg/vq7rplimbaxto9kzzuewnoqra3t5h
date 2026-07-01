import { DashboardSkeleton } from "@/components/skeletons/dashboard-skeleton";
import { CalendarSkeleton } from "@/components/skeletons/calendar-skeleton";
import { VehicleHealthSkeleton } from "@/components/skeletons/vehicle-health-skeleton";
import { VehiclesSkeleton } from "@/components/skeletons/vehicles-skeleton";
import { Section } from "./kit";

// A clipped preview frame so a full-page skeleton previews at catalog scale.
function Frame({ label, height = 360, children }: { label: string; height?: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <div
        className="relative rounded-xl border border-border bg-muted/20 overflow-hidden"
        style={{ height }}
      >
        <div className="pointer-events-none origin-top-left" style={{ transform: "scale(0.62)", width: "161%" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function PatternsSection() {
  return (
    <Section id="patterns" kicker="Patterns" title="Loading, empty, error & motion">
      <p className="text-sm text-muted-foreground -mt-2">
        Handcrafted skeletons that mirror each screen&apos;s real layout, so pages fill in rather than jump.
        Empty and error states are catalogued here as they land.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Frame label="Loading · Dashboard"><DashboardSkeleton /></Frame>
        <Frame label="Loading · Vehicles"><VehiclesSkeleton /></Frame>
        <Frame label="Loading · Vehicle Health" height={420}><VehicleHealthSkeleton /></Frame>
        <Frame label="Loading · Calendar" height={420}><CalendarSkeleton /></Frame>
      </div>
    </Section>
  );
}
