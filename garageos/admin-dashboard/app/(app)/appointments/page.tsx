import { AppointmentsList } from "@/components/appointments/appointments-list";

export const dynamic = "force-dynamic";

// Appointments = a management list on real data. Scheduling (the day/week grid,
// drag-drop) lives in /calendar; this complements it rather than duplicating it.
export default function AppointmentsPage() {
  return <AppointmentsList />;
}
