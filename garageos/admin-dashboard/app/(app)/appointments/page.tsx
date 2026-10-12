import { AppointmentsList } from "@/components/appointments/appointments-list";
import { getCurrentUser } from "@/lib/api/server";

export const dynamic = "force-dynamic";

// Appointments = a management list on real data. Scheduling (the day/week grid,
// drag-drop) lives in /calendar; this complements it rather than duplicating it.
export default async function AppointmentsPage() {
  const user = await getCurrentUser();
  return <AppointmentsList role={user.role ?? ""} />;
}
