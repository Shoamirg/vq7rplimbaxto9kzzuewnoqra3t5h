import { redirect } from "next/navigation";

import { CalendarClient } from "@/components/calendar/calendar-client";
import { ApiError, getCalendar } from "@/lib/api/server";

export const dynamic = "force-dynamic";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage() {
  const today = new Date();
  const start = iso(today);
  const end = iso(new Date(today.getTime() + 86_400_000));
  try {
    const data = await getCalendar(start, end);
    return <CalendarClient initial={data} initialDate={start} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/login");
    throw err;
  }
}
