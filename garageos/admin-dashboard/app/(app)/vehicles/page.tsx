import { redirect } from "next/navigation";
import { ApiError, getVehicles } from "@/lib/api/server";
import { VehiclesList } from "@/components/vehicles/vehicles-list";

export const dynamic = "force-dynamic";
export default async function VehiclesPage() {
  try { return <VehiclesList initial={await getVehicles()} />; }
  catch (err) { if (err instanceof ApiError && err.status === 401) redirect("/login"); throw err; }
}
