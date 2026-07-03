import { notFound, redirect } from "next/navigation";

import { VehicleIntelligenceCenter } from "@/components/vehicles/vehicle-intelligence-center";
import { ApiError, getVehicleIntelligence } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const data = await getVehicleIntelligence(id);
    return <VehicleIntelligenceCenter data={data} />;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect("/login");
      if (err.status === 404) notFound();
    }
    throw err;
  }
}
