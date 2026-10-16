import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";

import { ApiError, apiFetch } from "@/lib/api/server";
import type { Appointment } from "@/lib/api/types";
import { LOCALE_COOKIE, isLocale, translate } from "@/lib/i18n/dictionaries";
import { makeFormatters } from "@/lib/i18n/formatters";

export const dynamic = "force-dynamic";

export default async function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();

  let appointment: Appointment;
  try {
    appointment = await apiFetch<Appointment>(`/appointments/${id}`);
  } catch (error) {
    if (error instanceof ApiError && [403, 404].includes(error.status)) notFound();
    throw error;
  }

  const cookieStore = await cookies();
  const savedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(savedLocale) ? savedLocale : "uz";
  const t = (key: string) => translate(locale, key);
  const fmt = makeFormatters(locale);

  return (
    <article className="mx-auto max-w-3xl space-y-5 p-4 lg:p-8">
      <Link href="/appointments" className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">
        {t("work.back_list")}
      </Link>
      <header className="rounded-xl border border-border bg-card p-5">
        <p className="break-all text-sm text-muted-foreground">{appointment.id}</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{t("work.detail_title")}</h1>
        <p className="mt-2 inline-flex rounded-full bg-muted px-3 py-1 text-sm font-semibold text-foreground">{t(`status.${appointment.status}`)}</p>
      </header>
      <dl className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-xs font-semibold text-muted-foreground">{t("work.customer")}</dt><dd className="mt-1 break-words [overflow-wrap:anywhere] font-medium text-foreground">{appointment.customer_name}</dd><dd><Link className="inline-flex min-h-11 items-center break-words text-sm text-primary underline" href={`/customers/${appointment.customer_id}`}>{t("work.open_customer")}</Link></dd></div>
        <div className="min-w-0"><dt className="text-xs font-semibold text-muted-foreground">{t("work.vehicle")}</dt><dd className="mt-1 break-words [overflow-wrap:anywhere] font-medium text-foreground">{appointment.vehicle_summary}</dd><dd><Link className="inline-flex min-h-11 items-center break-words text-sm text-primary underline" href={`/vehicles/${appointment.vehicle_id}`}>{t("work.open_vehicle")}</Link></dd></div>
        <div className="min-w-0"><dt className="text-xs font-semibold text-muted-foreground">{t("work.when")}</dt><dd className="mt-1 break-words text-foreground">{fmt.date(appointment.appointment_local_date || appointment.appointment_date)} · {appointment.appointment_time}</dd></div>
        <div className="min-w-0"><dt className="text-xs font-semibold text-muted-foreground">{t("work.service")}</dt><dd className="mt-1 break-words [overflow-wrap:anywhere] text-foreground">{appointment.service_type || t("common.general_service")}</dd></div>
        <div className="min-w-0"><dt className="text-xs font-semibold text-muted-foreground">{t("work.mechanic")}</dt><dd className="mt-1 break-words [overflow-wrap:anywhere] text-foreground">{appointment.mechanic_name || t("work.unassigned")}</dd></div>
        <div className="min-w-0"><dt className="text-xs font-semibold text-muted-foreground">{t("work.duration")}</dt><dd className="mt-1 text-foreground">{fmt.number(appointment.estimated_duration_minutes)}</dd></div>
        {appointment.billing && <div className="min-w-0"><dt className="text-xs font-semibold text-muted-foreground">{t("work.billing")}</dt><dd><Link className="inline-flex min-h-11 items-center break-words text-sm text-primary underline" href={`/invoice/${appointment.billing.id}`}>{t("work.open_invoice")} · {appointment.billing.code}</Link></dd></div>}
        {appointment.notes && <div className="min-w-0 sm:col-span-2"><dt className="text-xs font-semibold text-muted-foreground">{t("work.notes")}</dt><dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground">{appointment.notes}</dd></div>}
      </dl>
    </article>
  );
}
