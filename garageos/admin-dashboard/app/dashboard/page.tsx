import { redirect } from "next/navigation";

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { ApiError, getCurrentUser, getStats, getTodayAppointments } from "@/lib/api/server";

// Reads the auth cookie at request time, so it must render dynamically.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  try {
    // Independent reads — fetch in parallel.
    const [user, stats, today] = await Promise.all([
      getCurrentUser(),
      getStats(),
      getTodayAppointments(),
    ]);

    const firstName = user.full_name.split(" ")[0] || user.full_name;
    return <DashboardClient userName={firstName} stats={stats} today={today} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login");
    }
    throw err;
  }
}
