import { notFound, redirect } from "next/navigation";

import { VehicleHealthScreen } from "@/components/vehicles/vehicle-health-screen";
import { ApiError, getVehicleHealth, getVehicleTimeline } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const [health, timeline] = await Promise.all([
      getVehicleHealth(id),
      getVehicleTimeline(id),
    ]);
    return <VehicleHealthScreen health={health} timeline={timeline} />;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect("/login");
      if (err.status === 404) notFound();
    }
    throw err;
  }
}
