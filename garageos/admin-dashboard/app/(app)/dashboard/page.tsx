import { redirect } from "next/navigation";

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import {
  ApiError,
  getCurrentUser,
  renderedAuthFingerprint,
  getFleetHealth,
  getStats,
  getTodayAppointments,
} from "@/lib/api/server";

// Reads the auth cookie at request time, so it must render dynamically.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  try {
    const user = await getCurrentUser();
    if (user.role === "mechanic") redirect("/mechanic/work");
    // Independent reads — fetch in parallel.
    const [stats, today, fleet] = await Promise.all([
      getStats(),
      getTodayAppointments(),
      getFleetHealth(),
    ]);

    const firstName = user.full_name.split(" ")[0] || user.full_name;
    return <DashboardClient userName={firstName} authFingerprint={await renderedAuthFingerprint()} stats={stats} today={today} fleet={fleet} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login?reauth=1");
    }
    throw err;
  }
}
